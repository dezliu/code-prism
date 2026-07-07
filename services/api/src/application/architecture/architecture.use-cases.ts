import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { AiWorkerArchClient } from '../../infrastructure/clients/ai-worker-arch.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import type { GraphSnapshotRepository } from '../../infrastructure/db/repositories/graph-snapshot.repository.js';
import type { ArchitectureManagedRepoRepository } from '../../infrastructure/db/repositories/architecture-managed-repo.repository.js';
import { generateArchDraftEvents } from './arch-generate.orchestrator.js';
import type { GraphData } from '../../infrastructure/db/models/graph-snapshot.model.js';

export interface ArchitectureView {
  id: string;
  repoId: string;
  version: number;
  isOfficial: boolean;
  graphData: GraphData;
  versionNote: string | null;
  repoName: string | null;
}

export interface ArchitectureSummaryView {
  id: string;
  repoId: string;
  version: number;
  isOfficial: boolean;
  versionNote: string | null;
  repoName: string | null;
  nodeCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminArchitectureListItem {
  repoId: string;
  repoName: string | null;
  draft: ArchitectureSummaryView | null;
  official: ArchitectureSummaryView | null;
}

function toView(
  snapshot: {
    id: string;
    repoId: string;
    version: number;
    isOfficial: boolean;
    graphData: GraphData;
    versionNote: string | null;
  },
  repoName: string | null,
): ArchitectureView {
  return {
    id: snapshot.id,
    repoId: snapshot.repoId,
    version: snapshot.version,
    isOfficial: snapshot.isOfficial,
    graphData: snapshot.graphData,
    versionNote: snapshot.versionNote,
    repoName,
  };
}

function toSummary(
  snapshot: {
    id: string;
    repoId: string;
    version: number;
    isOfficial: boolean;
    graphData: GraphData;
    versionNote: string | null;
    publishedAt?: Date | null;
    createdAt: Date;
  },
  repoName: string | null,
): ArchitectureSummaryView {
  return {
    id: snapshot.id,
    repoId: snapshot.repoId,
    version: snapshot.version,
    isOfficial: snapshot.isOfficial,
    versionNote: snapshot.versionNote,
    repoName,
    nodeCount: snapshot.graphData.nodes.length,
    publishedAt: snapshot.publishedAt?.toISOString() ?? null,
    updatedAt: (snapshot.publishedAt ?? snapshot.createdAt).toISOString(),
  };
}

async function buildAdminArchitectureItem(
  repoId: string,
  monitor: MonitorRepository,
  repos: RepoRepository,
): Promise<AdminArchitectureListItem> {
  const [draft, official, repo] = await Promise.all([
    monitor.getDraftArchitecture(repoId),
    monitor.getOfficialArchitecture(repoId),
    repos.findById(repoId),
  ]);
  const meta = repo?.metadata as { displayName?: string } | undefined;
  const repoName = meta?.displayName ?? repo?.name ?? null;
  return {
    repoId,
    repoName,
    draft: draft ? toSummary(draft, repoName) : null,
    official: official ? toSummary(official, repoName) : null,
  };
}

export class ListAdminArchitecturesUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
    private readonly managed: ArchitectureManagedRepoRepository,
  ) {}

  async execute(): Promise<AdminArchitectureListItem[]> {
    const managedIds = await this.managed.listRepoIds();
    const snapshotIds = await this.monitor.listArchitectureRepoIds();
    const orderedRepoIds = [
      ...managedIds,
      ...snapshotIds.filter((id) => !managedIds.includes(id)),
    ];

    const items = await Promise.all(
      orderedRepoIds.map((repoId) => buildAdminArchitectureItem(repoId, this.monitor, this.repos)),
    );

    return items.sort((a, b) => {
      const aTime = a.draft?.updatedAt ?? a.official?.updatedAt ?? '';
      const bTime = b.draft?.updatedAt ?? b.official?.updatedAt ?? '';
      return bTime.localeCompare(aTime);
    });
  }
}

export class AddManagedArchitectureUseCase {
  constructor(
    private readonly managed: ArchitectureManagedRepoRepository,
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string): Promise<AdminArchitectureListItem> {
    const repo = await this.repos.findById(repoId);
    if (!repo) {
      throw new NotFoundError('Repo', repoId);
    }

    await this.managed.add(repoId);
    return buildAdminArchitectureItem(repoId, this.monitor, this.repos);
  }
}

export class GetArchitectureForBrowseUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string): Promise<ArchitectureView> {
    const snapshot = await this.monitor.getOfficialArchitecture(repoId);
    if (!snapshot) {
      throw new NotFoundError('OfficialArchitecture', repoId);
    }
    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    return toView(snapshot, meta?.displayName ?? repo?.name ?? null);
  }
}

export class GetArchitectureDraftUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string): Promise<ArchitectureView> {
    const snapshot = await this.monitor.getDraftArchitecture(repoId);
    if (!snapshot) {
      throw new NotFoundError('ArchitectureDraft', repoId);
    }
    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    return toView(snapshot, meta?.displayName ?? repo?.name ?? null);
  }
}

export class GenerateArchDraftUseCase {
  constructor(
    private readonly repos: RepoRepository,
    private readonly monitor: MonitorRepository,
    private readonly snapshots: GraphSnapshotRepository,
    private readonly core: CoreHttpClient,
    private readonly aiArch: AiWorkerArchClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async execute(repoId: string): Promise<ArchitectureView> {
    const { randomUUID } = await import('node:crypto');
    const streamId = randomUUID();

    let graphData: GraphData | null = null;
    let snapshotId: string | null = null;

    for await (const event of generateArchDraftEvents(
      {
        repos: this.repos,
        monitor: this.monitor,
        snapshots: this.snapshots,
        core: this.core,
        aiArch: this.aiArch,
        cancelStore: this.cancelStore,
      },
      { repoId, streamId },
    )) {
      if (event.event === 'error') {
        throw new ApplicationError(
          String(event.data.message ?? '架构图生成失败'),
          String(event.data.code ?? 'GENERATE_FAILED'),
        );
      }
      if (event.event === 'done' && !event.data.interrupted) {
        graphData = event.data.graphData as GraphData;
        snapshotId = String(event.data.snapshotId ?? '');
      }
    }

    if (!graphData || !snapshotId) {
      throw new ApplicationError('架构图生成未正常结束', 'GENERATE_FAILED');
    }

    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    return {
      id: snapshotId,
      repoId,
      version: 1,
      isOfficial: false,
      graphData,
      versionNote: null,
      repoName: meta?.displayName ?? repo?.name ?? null,
    };
  }
}

export class PublishOfficialArchitectureUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string, versionNote: string): Promise<ArchitectureView> {
    const { GraphSnapshotModel } = await import(
      '../../infrastructure/db/models/graph-snapshot.model.js'
    );

    const published = await GraphSnapshotModel.transaction(async (trx) => {
      const draft = await GraphSnapshotModel.query(trx)
        .where('repo_id', repoId)
        .where('is_official', false)
        .orderBy('created_at', 'desc')
        .first();
      if (!draft) {
        throw new NotFoundError('ArchitectureDraft', repoId);
      }

      const maxVersionRow = await GraphSnapshotModel.query(trx)
        .where('repo_id', repoId)
        .max('version as maxVersion')
        .first();
      const nextVersion = Number((maxVersionRow as { maxVersion?: number })?.maxVersion ?? 0) + 1;

      await GraphSnapshotModel.query(trx)
        .where('repo_id', repoId)
        .where('is_official', true)
        .patch({ isOfficial: false });

      await GraphSnapshotModel.query(trx).findById(draft.id).patch({
        isOfficial: true,
        version: nextVersion,
        versionNote,
        publishedAt: new Date(),
      });

      return GraphSnapshotModel.query(trx)
        .where('repo_id', repoId)
        .where('is_official', true)
        .orderBy('version', 'desc')
        .first()
        .throwIfNotFound();
    });

    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    return toView(published, meta?.displayName ?? repo?.name ?? null);
  }
}
