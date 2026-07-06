import { randomUUID } from 'node:crypto';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerArchClient } from '../../infrastructure/clients/ai-worker-arch.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import type { GraphData } from '../../infrastructure/db/models/graph-snapshot.model.js';
import type { GraphSnapshotRepository } from '../../infrastructure/db/repositories/graph-snapshot.repository.js';
import type { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import { ApplicationError } from '../../domain/errors.js';
import { parseAndValidateGraphData } from './validate-graph-data.js';

export type ArchGeneratePhase =
  | 'fetching_code'
  | 'analyzing'
  | 'generating'
  | 'validating'
  | 'repairing';

export interface GenerateArchDraftInput {
  repoId: string;
  streamId: string;
}

export interface GenerateArchDraftHooks {
  onPhase?: (phase: ArchGeneratePhase, attempt?: number) => void | Promise<void>;
}

export interface GenerateArchDraftDeps {
  repos: RepoRepository;
  monitor: MonitorRepository;
  snapshots: GraphSnapshotRepository;
  core: CoreHttpClient;
  aiArch: AiWorkerArchClient;
  cancelStore: StreamCancelStore;
}

const MAX_ATTEMPTS = 3;

function summarizeOfficialGraph(graphData: GraphData | undefined): string {
  if (!graphData?.nodes?.length) {
    return '';
  }
  const nodeLines = graphData.nodes
    .slice(0, 20)
    .map((n) => `- ${n.id} (${n.type}): ${n.label}`)
    .join('\n');
  const edgeLines = graphData.edges
    .slice(0, 30)
    .map((e) => `- ${e.source} → ${e.target}${e.label ? ` [${e.label}]` : ''}`)
    .join('\n');
  return `节点：\n${nodeLines}\n\n边：\n${edgeLines}`;
}

async function resolveRepoName(repos: RepoRepository, repoId: string): Promise<string> {
  const repo = await repos.findById(repoId);
  if (!repo) {
    return repoId;
  }
  const meta = repo.metadata as { displayName?: string } | undefined;
  return meta?.displayName ?? repo.name;
}

export async function* generateArchDraftEvents(
  deps: GenerateArchDraftDeps,
  input: GenerateArchDraftInput,
  hooks?: GenerateArchDraftHooks,
): AsyncGenerator<SseEvent, void, unknown> {
  const repo = await deps.repos.findById(input.repoId);
  if (!repo) {
    yield {
      event: 'error',
      data: { code: 'NOT_FOUND', message: `Repo ${input.repoId} not found` },
    };
    return;
  }

  const repoName = await resolveRepoName(deps.repos, input.repoId);

  yield { event: 'status', data: { phase: 'fetching_code', streamId: input.streamId } };
  await hooks?.onPhase?.('fetching_code');

  let contextText: string;
  let url: string;
  try {
    const archContext = await deps.core.buildArchContext(input.repoId);
    contextText = archContext.contextText;
    url = archContext.url;
  } catch (error) {
    yield {
      event: 'error',
      data: {
        code: 'FETCH_CODE_FAILED',
        message: error instanceof Error ? error.message : '拉取代码上下文失败',
      },
    };
    return;
  }

  if (await deps.cancelStore.isCancelled(input.streamId)) {
    yield { event: 'done', data: { repoId: input.repoId, interrupted: true } };
    return;
  }

  const official = await deps.monitor.getOfficialArchitecture(input.repoId);
  const officialSummary = summarizeOfficialGraph(official?.graphData);

  yield { event: 'status', data: { phase: 'analyzing', streamId: input.streamId } };
  await hooks?.onPhase?.('analyzing');

  let analysis: string;
  try {
    analysis = await deps.aiArch.analyzeArch({
      repoName,
      repoId: input.repoId,
      url,
      context: contextText,
      officialSummary,
    });
  } catch (error) {
    yield {
      event: 'error',
      data: {
        code: 'ANALYZE_FAILED',
        message: error instanceof Error ? error.message : '架构分析失败',
      },
    };
    return;
  }

  if (await deps.cancelStore.isCancelled(input.streamId)) {
    yield { event: 'done', data: { repoId: input.repoId, interrupted: true } };
    return;
  }

  let lastRawJson = '';
  let validated: GraphData | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const phase: ArchGeneratePhase = attempt === 1 ? 'generating' : 'repairing';
    yield { event: 'status', data: { phase, streamId: input.streamId, attempt } };
    await hooks?.onPhase?.(phase, attempt);

    try {
      if (attempt === 1) {
        lastRawJson = await deps.aiArch.generateArchGraph({
          repoName,
          analysis,
          context: contextText,
        });
      } else {
        const previous = parseAndValidateGraphData(lastRawJson);
        lastRawJson = await deps.aiArch.repairArchGraph({
          errors: previous.errors,
          badJson: lastRawJson,
          analysis,
        });
      }
    } catch (error) {
      yield {
        event: 'error',
        data: {
          code: 'GENERATE_FAILED',
          message: error instanceof Error ? error.message : '架构图生成失败',
        },
      };
      return;
    }

    if (await deps.cancelStore.isCancelled(input.streamId)) {
      yield { event: 'done', data: { repoId: input.repoId, interrupted: true } };
      return;
    }

    yield { event: 'status', data: { phase: 'validating', streamId: input.streamId, attempt } };
    await hooks?.onPhase?.('validating', attempt);

    const validation = parseAndValidateGraphData(lastRawJson);
    if (validation.ok && validation.data) {
      validated = validation.data;
      break;
    }

    if (attempt === MAX_ATTEMPTS) {
      yield {
        event: 'error',
        data: {
          code: 'GRAPH_VALIDATION_FAILED',
          message: validation.errors.join('; '),
          errors: validation.errors,
        },
      };
      return;
    }
  }

  if (!validated) {
    yield {
      event: 'error',
      data: { code: 'GRAPH_VALIDATION_FAILED', message: '架构图校验失败' },
    };
    return;
  }

  try {
    const snapshot = await deps.snapshots.insertDraft(input.repoId, validated);
    yield {
      event: 'done',
      data: {
        repoId: input.repoId,
        snapshotId: snapshot.id,
        graphData: validated,
        interrupted: false,
      },
    };
  } catch (error) {
    yield {
      event: 'error',
      data: {
        code: error instanceof ApplicationError ? error.code : 'SAVE_FAILED',
        message: error instanceof Error ? error.message : '保存架构图草稿失败',
      },
    };
  }
}
