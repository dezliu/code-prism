import { randomUUID } from 'node:crypto';
import { RepoModel, type AuthType } from '../models/repo.model.js';
import { RepoMetadataModel } from '../models/repo-metadata.model.js';

export interface CreateRepoInput {
  url: string;
  authType: AuthType;
  authConfig?: Record<string, unknown>;
  defaultBranch?: string;
  branchPolicy?: Record<string, unknown>;
  authToken?: string;
}

export interface UpdateRepoInput {
  defaultBranch?: string;
  authToken?: string;
  enabled?: boolean;
}

export interface UpdateRepoMetadataInput {
  displayName?: string;
  tags?: string[];
  businessOwner?: string | null;
  techOwner?: string | null;
  indexedInSearch?: boolean;
}

function deriveName(url: string): string {
  const trimmed = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || 'repo';
}

export class RepoRepository {
  async listAll(): Promise<RepoModel[]> {
    return RepoModel.query().withGraphFetched('metadata').orderBy('updated_at', 'desc');
  }

  async findById(id: string): Promise<RepoModel | undefined> {
    return RepoModel.query().findById(id).withGraphFetched('metadata');
  }

  async create(input: CreateRepoInput): Promise<RepoModel> {
    const id = randomUUID();
    const name = deriveName(input.url);

    await RepoModel.query().insert({
      id,
      url: input.url.trim(),
      name,
      authType: input.authType,
      authConfig: input.authToken
        ? { token: input.authToken }
        : input.authConfig ?? null,
      defaultBranch: input.defaultBranch ?? 'main',
      branchPolicy: input.branchPolicy ?? null,
      connectionStatus: 'pending',
      enabled: true,
      indexedInSearch: false,
      indexStatus: 'none',
    });

    await RepoMetadataModel.query().insert({
      repoId: id,
      displayName: name,
      tags: [],
    });

    return (await this.findById(id))!;
  }

  async updateConnection(
    id: string,
    status: RepoModel['connectionStatus'],
    info: {
      error?: string | null;
      languageSummary?: Record<string, number> | null;
      lastCommitAt?: Date | null;
      lastCommitSummary?: string | null;
    },
  ): Promise<void> {
    await RepoModel.query().findById(id).patch({
      connectionStatus: status,
      connectionError: info.error ?? null,
      languageSummary: info.languageSummary ?? null,
      lastCommitAt: info.lastCommitAt ?? null,
      lastCommitSummary: info.lastCommitSummary ?? null,
      updatedAt: new Date(),
    });
  }

  async updateMetadata(repoId: string, input: UpdateRepoMetadataInput): Promise<RepoMetadataModel> {
    const patch: Partial<RepoMetadataModel> = { updatedAt: new Date() };
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.businessOwner !== undefined) patch.businessOwner = input.businessOwner;
    if (input.techOwner !== undefined) patch.techOwner = input.techOwner;

    const patched = await RepoMetadataModel.query().findById(repoId).patch(patch);
    if (patched === 0) {
      const repo = await RepoModel.query().findById(repoId);
      if (!repo) {
        throw new Error(`Repo not found: ${repoId}`);
      }
      await RepoMetadataModel.query().insert({
        repoId,
        displayName: patch.displayName ?? repo.name,
        tags: patch.tags ?? [],
        businessOwner: patch.businessOwner ?? null,
        techOwner: patch.techOwner ?? null,
      });
    }

    if (input.indexedInSearch !== undefined) {
      await RepoModel.query().findById(repoId).patch({
        indexedInSearch: input.indexedInSearch,
        indexStatus: input.indexedInSearch ? 'queued' : 'removed',
        updatedAt: new Date(),
      });
    }

    return RepoMetadataModel.query().findById(repoId).throwIfNotFound();
  }

  async setIndexStatus(repoId: string, indexStatus: RepoModel['indexStatus']): Promise<void> {
    await RepoModel.query().findById(repoId).patch({
      indexStatus,
      updatedAt: new Date(),
    });
  }

  async setEnabled(repoId: string, enabled: boolean): Promise<void> {
    await RepoModel.query().findById(repoId).patch({
      enabled,
      connectionStatus: enabled ? 'connected' : 'disabled',
      updatedAt: new Date(),
    });
  }

  async delete(repoId: string): Promise<void> {
    await RepoModel.query().deleteById(repoId);
  }

  async updateRepo(repoId: string, input: UpdateRepoInput): Promise<RepoModel> {
    const patch: Partial<RepoModel> = { updatedAt: new Date() };
    if (input.defaultBranch !== undefined) patch.defaultBranch = input.defaultBranch;
    if (input.enabled !== undefined) {
      patch.enabled = input.enabled;
      patch.connectionStatus = input.enabled ? 'connected' : 'disabled';
    }
    if (input.authToken !== undefined) {
      patch.authConfig = input.authToken ? { token: input.authToken } : null;
    }
    await RepoModel.query().findById(repoId).patch(patch);
    return (await this.findById(repoId))!;
  }
}
