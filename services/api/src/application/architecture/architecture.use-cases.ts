import { NotFoundError } from '../../domain/errors.js';
import { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
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

export class ListAdminArchitecturesUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(): Promise<AdminArchitectureListItem[]> {
    const repoIds = await this.monitor.listArchitectureRepoIds();
    const repoMap = new Map(
      (await this.repos.listAll()).map((r) => {
        const meta = r.metadata as { displayName?: string } | undefined;
        return [r.id, meta?.displayName ?? r.name] as const;
      }),
    );

    const items = await Promise.all(
      repoIds.map(async (repoId) => {
        const [draft, official] = await Promise.all([
          this.monitor.getDraftArchitecture(repoId),
          this.monitor.getOfficialArchitecture(repoId),
        ]);
        const repoName = repoMap.get(repoId) ?? null;
        return {
          repoId,
          repoName,
          draft: draft ? toSummary(draft, repoName) : null,
          official: official ? toSummary(official, repoName) : null,
        };
      }),
    );

    return items.sort((a, b) => {
      const aTime = a.draft?.updatedAt ?? a.official?.updatedAt ?? '';
      const bTime = b.draft?.updatedAt ?? b.official?.updatedAt ?? '';
      return bTime.localeCompare(aTime);
    });
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
    private readonly core: CoreHttpClient,
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string): Promise<ArchitectureView> {
    await this.core.generateArchDraft(repoId);
    const draft = await this.monitor.getDraftArchitecture(repoId);
    if (!draft) {
      throw new NotFoundError('ArchitectureDraft', repoId);
    }
    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    return toView(draft, meta?.displayName ?? repo?.name ?? null);
  }
}

export class PublishOfficialArchitectureUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string, versionNote: string): Promise<ArchitectureView> {
    const draft = await this.monitor.getDraftArchitecture(repoId);
    if (!draft) {
      throw new NotFoundError('ArchitectureDraft', repoId);
    }
    const { GraphSnapshotModel } = await import(
      '../../infrastructure/db/models/graph-snapshot.model.js'
    );

    const maxVersionRow = await GraphSnapshotModel.query()
      .where('repo_id', repoId)
      .max('version as maxVersion')
      .first();
    const nextVersion = Number((maxVersionRow as { maxVersion?: number })?.maxVersion ?? 0) + 1;

    await GraphSnapshotModel.query()
      .where('repo_id', repoId)
      .where('is_official', true)
      .patch({ isOfficial: false });

    await GraphSnapshotModel.query().findById(draft.id).patch({
      isOfficial: true,
      version: nextVersion,
      versionNote,
      publishedAt: new Date(),
    });

    const repo = await this.repos.findById(repoId);
    const meta = repo?.metadata as { displayName?: string } | undefined;
    const published = await this.monitor.getOfficialArchitecture(repoId);
    return toView(published!, meta?.displayName ?? repo?.name ?? null);
  }
}
