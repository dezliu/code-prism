import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient, SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import { ApplicationError } from '../../domain/errors.js';
import { buildKnowledgeDocContext } from './knowledge.use-cases.js';

export type DocGeneratePhase = 'fetching_code' | 'analyzing' | 'generating';

export interface GenerateKnowledgeDocInput {
  itemId: string;
  streamId: string;
  title?: string;
  docType?: string;
}

export interface GenerateKnowledgeDocHooks {
  onPhase?: (phase: DocGeneratePhase) => void | Promise<void>;
  onToken?: (text: string, accumulated: string) => void | Promise<void>;
}

export interface GenerateKnowledgeDocDeps {
  knowledge: KnowledgeRepository;
  repos: RepoRepository;
  core: CoreHttpClient;
  aiWorker: AiWorkerStreamClient;
  cancelStore: StreamCancelStore;
}

async function resolveRepoNames(repos: RepoRepository, repoIds: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const repoId of repoIds) {
    const repo = await repos.findById(repoId);
    if (repo) {
      const meta = repo.metadata as { displayName?: string } | undefined;
      names.push(meta?.displayName ?? repo.name);
    }
  }
  return names;
}

export async function* generateKnowledgeDocEvents(
  deps: GenerateKnowledgeDocDeps,
  input: GenerateKnowledgeDocInput,
  hooks?: GenerateKnowledgeDocHooks,
): AsyncGenerator<SseEvent, void, unknown> {
  const pair = await deps.knowledge.findItemWithBase(input.itemId);
  if (!pair) {
    yield {
      event: 'error',
      data: { code: 'NOT_FOUND', message: `KnowledgeDocItem ${input.itemId} not found` },
    };
    return;
  }

  const title = input.title?.trim() || pair.item.title;
  const docType = input.docType || pair.item.docType;
  const repoIds = pair.base.repoIds;

  if (!repoIds?.length) {
    yield {
      event: 'error',
      data: { code: 'VALIDATION_ERROR', message: '请先为知识库关联至少一个 Git 仓库' },
    };
    return;
  }

  if (input.title !== undefined || input.docType !== undefined) {
    await deps.knowledge.updateItem(input.itemId, {
      ...(input.title !== undefined ? { title } : {}),
      ...(input.docType !== undefined ? { docType: docType as typeof pair.item.docType } : {}),
    });
  }

  yield { event: 'status', data: { phase: 'fetching_code', streamId: input.streamId } };
  await hooks?.onPhase?.('fetching_code');

  let context: string;
  try {
    context = await buildKnowledgeDocContext(deps.core, repoIds);
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

  const repoNames = await resolveRepoNames(deps.repos, repoIds);
  let content = '';

  try {
    for await (const event of deps.aiWorker.streamGenerateDoc({
      streamId: input.streamId,
      title,
      docType,
      repoNames,
      context,
    })) {
      if (await deps.cancelStore.isCancelled(input.streamId)) {
        yield { event: 'done', data: { itemId: input.itemId, content, interrupted: true } };
        return;
      }

      if (event.event === 'token') {
        content += String(event.data.text ?? '');
        await hooks?.onToken?.(String(event.data.text ?? ''), content);
        yield event;
        continue;
      }

      if (event.event === 'status') {
        const phase = event.data.phase as DocGeneratePhase | undefined;
        if (phase) {
          await hooks?.onPhase?.(phase);
        }
        yield event;
        continue;
      }

      if (event.event === 'error') {
        yield event;
        return;
      }

      if (event.event === 'done') {
        const finalContent = String(event.data.content ?? content);
        yield {
          event: 'done',
          data: {
            itemId: input.itemId,
            content: finalContent,
            interrupted: Boolean(event.data.interrupted),
          },
        };
        return;
      }
    }
  } catch (error) {
    yield {
      event: 'error',
      data: {
        code: error instanceof ApplicationError ? error.code : 'GENERATE_FAILED',
        message: error instanceof Error ? error.message : '文档生成失败',
      },
    };
  }
}
