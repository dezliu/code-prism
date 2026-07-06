import { ApplicationError, NotFoundError } from '../../domain/errors.js';
import {
  RepoRepository,
  type CreateRepoInput,
  type UpdateRepoMetadataInput,
} from '../../infrastructure/db/repositories/repo.repository.js';
import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';
import type { RepoModel } from '../../infrastructure/db/models/repo.model.js';
import type { RepoMetadataModel } from '../../infrastructure/db/models/repo-metadata.model.js';

export interface RepoSummary {
  id: string;
  name: string;
  url: string;
  indexStatus: string | null;
  connectionStatus: string;
  indexedInSearch: boolean;
  enabled: boolean;
  displayName: string | null;
  tags: string[];
  businessOwner: string | null;
  techOwner: string | null;
  languageSummary: Record<string, number> | null;
  lastCommitAt: string | null;
  lastCommitSummary: string | null;
}

function toSummary(repo: RepoModel): RepoSummary {
  const meta = repo.metadata as RepoMetadataModel | undefined;
  return {
    id: repo.id,
    name: repo.name,
    url: repo.url,
    indexStatus: repo.indexStatus,
    connectionStatus: repo.connectionStatus,
    indexedInSearch: repo.indexedInSearch,
    enabled: repo.enabled,
    displayName: meta?.displayName ?? null,
    tags: meta?.tags ?? [],
    businessOwner: meta?.businessOwner ?? null,
    techOwner: meta?.techOwner ?? null,
    languageSummary: repo.languageSummary,
    lastCommitAt: repo.lastCommitAt?.toISOString() ?? null,
    lastCommitSummary: repo.lastCommitSummary,
  };
}

export class ListReposUseCase {
  constructor(private readonly repos: RepoRepository) {}

  async execute(): Promise<RepoSummary[]> {
    const rows = await this.repos.listAll();
    return rows.map(toSummary);
  }
}

export class CreateRepoUseCase {
  constructor(
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
  ) {}

  async execute(input: CreateRepoInput): Promise<RepoSummary> {
    if (!input.url?.trim()) {
      throw new ApplicationError('仓库地址不能为空', 'VALIDATION_ERROR');
    }
    const repo = await this.repos.create(input);
    const test = await this.core.testConnection({
      url: repo.url,
      authType: repo.authType,
      defaultBranch: repo.defaultBranch,
    });
    await this.repos.updateConnection(repo.id, test.ok ? 'connected' : 'failed', {
      error: test.error,
      languageSummary: test.languageSummary,
      lastCommitAt: test.lastCommitAt ? new Date(test.lastCommitAt) : null,
      lastCommitSummary: test.lastCommitSummary,
    });
    const updated = await this.repos.findById(repo.id);
    return toSummary(updated!);
  }
}

export class TestRepoConnectionUseCase {
  constructor(
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
  ) {}

  async execute(repoId: string): Promise<{ ok: boolean; error?: string }> {
    const repo = await this.repos.findById(repoId);
    if (!repo) {
      throw new NotFoundError('Repo', repoId);
    }
    const result = await this.core.testConnection({
      url: repo.url,
      authType: repo.authType,
      defaultBranch: repo.defaultBranch,
    });
    await this.repos.updateConnection(repo.id, result.ok ? 'connected' : 'failed', {
      error: result.error,
      languageSummary: result.languageSummary,
      lastCommitAt: result.lastCommitAt ? new Date(result.lastCommitAt) : null,
      lastCommitSummary: result.lastCommitSummary,
    });
    return { ok: result.ok, error: result.error };
  }
}

export class UpdateRepoMetadataUseCase {
  constructor(
    private readonly repos: RepoRepository,
    private readonly core: CoreHttpClient,
  ) {}

  async execute(repoId: string, input: UpdateRepoMetadataInput): Promise<RepoSummary> {
    const repo = await this.repos.findById(repoId);
    if (!repo) {
      throw new NotFoundError('Repo', repoId);
    }
    if (input.displayName !== undefined) {
      const name = input.displayName.trim();
      if (name.length < 2 || name.length > 50) {
        throw new ApplicationError('业务中文名长度须为 2~50 字符', 'VALIDATION_ERROR');
      }
    }
    if (input.tags !== undefined) {
      const unique = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))];
      input.tags = unique;
    }
    if (input.indexedInSearch && repo.connectionStatus !== 'connected') {
      throw new ApplicationError('仅已连接仓库可纳入检索库', 'VALIDATION_ERROR');
    }
    await this.repos.updateMetadata(repoId, input);
    if (input.indexedInSearch) {
      await this.core.enqueueIndex(repoId);
    }
    const updated = await this.repos.findById(repoId);
    return toSummary(updated!);
  }
}

export class UpdateRepoUseCase {
  constructor(private readonly repos: RepoRepository) {}

  async execute(
    repoId: string,
    input: import('../../infrastructure/db/repositories/repo.repository.js').UpdateRepoInput,
  ): Promise<RepoSummary> {
    const repo = await this.repos.findById(repoId);
    if (!repo) {
      throw new NotFoundError('Repo', repoId);
    }
    const updated = await this.repos.updateRepo(repoId, input);
    return toSummary(updated);
  }
}
