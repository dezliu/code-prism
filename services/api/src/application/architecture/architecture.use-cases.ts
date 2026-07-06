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
