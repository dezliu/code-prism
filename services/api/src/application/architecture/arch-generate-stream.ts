import { randomUUID } from 'node:crypto';
import type { ApiConfig } from '../../config.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import { createAiWorkerArchClient, type AiWorkerArchClient } from '../../infrastructure/clients/ai-worker-arch.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { SseEvent } from '../../infrastructure/clients/ai-worker.client.js';
import { GraphSnapshotRepository } from '../../infrastructure/db/repositories/graph-snapshot.repository.js';
import { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import { generateArchDraftEvents } from './arch-generate.orchestrator.js';

export interface StreamGenerateArchInput {
  repoId: string;
  streamId: string;
}

export class StreamGenerateArchUseCase {
  constructor(
    private readonly repos: RepoRepository,
    private readonly monitor: MonitorRepository,
    private readonly snapshots: GraphSnapshotRepository,
    private readonly core: CoreHttpClient,
    private readonly aiArch: AiWorkerArchClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async *execute(input: StreamGenerateArchInput): AsyncGenerator<SseEvent, void, unknown> {
    yield* generateArchDraftEvents(
      {
        repos: this.repos,
        monitor: this.monitor,
        snapshots: this.snapshots,
        core: this.core,
        aiArch: this.aiArch,
        cancelStore: this.cancelStore,
      },
      input,
    );
  }
}

export function createStreamGenerateArchUseCase(
  config: ApiConfig,
  deps: {
    core: CoreHttpClient;
    cancelStore: StreamCancelStore;
    aiArch?: AiWorkerArchClient;
  },
): StreamGenerateArchUseCase {
  return new StreamGenerateArchUseCase(
    new RepoRepository(),
    new MonitorRepository(),
    new GraphSnapshotRepository(),
    deps.core,
    deps.aiArch ?? createAiWorkerArchClient(config),
    deps.cancelStore,
  );
}

export function createArchStreamId(): string {
  return randomUUID();
}
