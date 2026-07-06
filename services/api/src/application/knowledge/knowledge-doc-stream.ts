import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerStreamClient, SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { KnowledgeRepository } from '../../infrastructure/db/repositories/knowledge.repository.js';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import { generateKnowledgeDocEvents } from './knowledge-doc-generate.orchestrator.js';
import type { StreamGenerateKnowledgeDocInput } from './knowledge-doc-stream.types.js';

export type { StreamGenerateKnowledgeDocInput } from './knowledge-doc-stream.types.js';

export class StreamGenerateKnowledgeDocUseCase {
  constructor(
    private readonly knowledge: KnowledgeRepository,
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
    private readonly aiWorker: AiWorkerStreamClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async *execute(input: StreamGenerateKnowledgeDocInput): AsyncGenerator<SseEvent, void, unknown> {
    for await (const event of generateKnowledgeDocEvents(
      {
        knowledge: this.knowledge,
        repos: this.repos,
        core: this.core,
        aiWorker: this.aiWorker,
        cancelStore: this.cancelStore,
      },
      input,
    )) {
      if (event.event === 'done' && !event.data.interrupted) {
        const finalContent = String(event.data.content ?? '');
        await this.knowledge.updateItem(input.itemId, { content: finalContent });
        yield {
          event: 'done',
          data: {
            itemId: input.itemId,
            content: finalContent,
            interrupted: false,
          },
        };
        return;
      }

      yield event;

      if (event.event === 'error' || event.event === 'done') {
        return;
      }
    }
  }
}
