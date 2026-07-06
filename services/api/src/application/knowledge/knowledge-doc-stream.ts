import { ApplicationError } from '../../domain/errors.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient, SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { KnowledgeDocRepository } from '../../infrastructure/db/repositories/knowledge-doc.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import {
  buildKnowledgeDocContext,
} from './knowledge.use-cases.js';

export interface StreamGenerateKnowledgeDocInput {
  docId: string;
  streamId: string;
  title?: string;
  docType?: string;
  repoIds?: string[];
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

export class StreamGenerateKnowledgeDocUseCase {
  constructor(
    private readonly docs: KnowledgeDocRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerStreamClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async *execute(input: StreamGenerateKnowledgeDocInput): AsyncGenerator<SseEvent, void, unknown> {
    const doc = await this.docs.findById(input.docId);
    if (!doc) {
      yield {
        event: 'error',
        data: { code: 'NOT_FOUND', message: `KnowledgeDoc ${input.docId} not found` },
      };
      return;
    }

    const title = input.title?.trim() || doc.title;
    const docType = input.docType || doc.docType;
    const repoIds = input.repoIds ?? doc.repoIds;

    if (!repoIds?.length) {
      yield {
        event: 'error',
        data: { code: 'VALIDATION_ERROR', message: '请先关联至少一个 Git 仓库' },
      };
      return;
    }

    if (input.title !== undefined || input.docType !== undefined || input.repoIds !== undefined) {
      await this.docs.update(input.docId, {
        ...(input.title !== undefined ? { title } : {}),
        ...(input.docType !== undefined ? { docType } : {}),
        ...(input.repoIds !== undefined ? { repoIds } : {}),
      });
    }

    yield { event: 'status', data: { phase: 'fetching_code', streamId: input.streamId } };

    let context: string;
    try {
      context = await buildKnowledgeDocContext(this.core, repoIds);
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

    const repoNames = await resolveRepoNames(this.repos, repoIds);
    let content = '';

    try {
      for await (const event of this.aiWorker.streamGenerateDoc({
        streamId: input.streamId,
        title,
        docType,
        repoNames,
        context,
      })) {
        if (await this.cancelStore.isCancelled(input.streamId)) {
          yield { event: 'done', data: { docId: input.docId, content, interrupted: true } };
          return;
        }

        if (event.event === 'token') {
          content += String(event.data.text ?? '');
          yield event;
          continue;
        }

        if (event.event === 'status' || event.event === 'error') {
          yield event;
          if (event.event === 'error') {
            return;
          }
          continue;
        }

        if (event.event === 'done') {
          const finalContent = String(event.data.content ?? content);
          await this.docs.update(input.docId, { content: finalContent });
          yield {
            event: 'done',
            data: {
              docId: input.docId,
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
          code: 'GENERATE_FAILED',
          message: error instanceof Error ? error.message : '文档生成失败',
        },
      };
    }
  }
}
