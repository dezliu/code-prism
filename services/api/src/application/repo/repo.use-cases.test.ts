import { describe, expect, it, vi } from 'vitest';
import {
  CreateRepoUseCase,
  UpdateRepoMetadataUseCase,
  DeleteRepoUseCase,
} from './repo.use-cases';
import { CoreHttpClientStub } from '../../infrastructure/clients/core-http.client';
import type { RepoRepository } from '../../infrastructure/db/repositories/repo.repository';

function createMockRepoRepo(): RepoRepository {
  const store = new Map<string, any>();

  return {
    listAll: async () => [...store.values()],
    findById: async (id: string) => store.get(id),
    create: async (input) => {
      const id = 'repo-1';
      const repo = {
        id,
        url: input.url,
        name: 'payment-service',
        authType: input.authType,
        authConfig: null,
        defaultBranch: 'main',
        branchPolicy: null,
        connectionStatus: 'pending',
        connectionError: null,
        languageSummary: null,
        lastCommitAt: null,
        lastCommitSummary: null,
        enabled: true,
        indexedInSearch: false,
        indexStatus: 'none',
        syncStatus: 'synced',
        localCommitHash: null,
        remoteCommitHash: null,
        indexedCommitHash: null,
        lastSyncedAt: null,
        metadata: { repoId: id, displayName: 'payment-service', tags: [] },
      };
      store.set(id, repo);
      return repo;
    },
    updateConnection: async (id, status, info) => {
      const repo = store.get(id);
      if (repo) {
        repo.connectionStatus = status;
        repo.languageSummary = info.languageSummary ?? null;
      }
    },
    updateMetadata: async (repoId, input) => {
      const repo = store.get(repoId);
      if (input.indexedInSearch !== undefined) {
        repo.indexedInSearch = input.indexedInSearch;
        repo.indexStatus = input.indexedInSearch ? 'queued' : 'removed';
      }
      if (input.displayName) {
        repo.metadata.displayName = input.displayName;
      }
      return repo.metadata;
    },
    setIndexStatus: async () => {},
    setEnabled: async () => {},
    updateRepo: async (repoId, input) => {
      const repo = store.get(repoId);
      if (input.enabled !== undefined) repo.enabled = input.enabled;
      return repo;
    },
    delete: async (repoId) => {
      store.delete(repoId);
    },
  } as unknown as RepoRepository;
}

describe('CreateRepoUseCase', () => {
  it('creates repo and tests connection via core', async () => {
    const useCase = new CreateRepoUseCase(createMockRepoRepo(), new CoreHttpClientStub());
    const result = await useCase.execute({
      url: 'https://github.com/org/payment-service.git',
      authType: 'https',
    });
    expect(result.connectionStatus).toBe('connected');
    expect(result.languageSummary).toBeTruthy();
  });
});

describe('UpdateRepoMetadataUseCase', () => {
  it('enqueues index when纳入检索库', async () => {
    const repos = createMockRepoRepo();
    const create = new CreateRepoUseCase(repos, new CoreHttpClientStub());
    const created = await create.execute({
      url: 'https://github.com/org/payment-service.git',
      authType: 'https',
    });
    const core = new CoreHttpClientStub();
    const enqueueSpy = vi.spyOn(core, 'enqueueIndex');
    const update = new UpdateRepoMetadataUseCase(repos, core);
    const result = await update.execute(created.id, {
      displayName: '支付中台服务',
      indexedInSearch: true,
    });
    expect(result.displayName).toBe('支付中台服务');
    expect(result.indexedInSearch).toBe(true);
    expect(enqueueSpy).toHaveBeenCalledWith(created.id);
  });

  it('removes index when移出检索库', async () => {
    const repos = createMockRepoRepo();
    const create = new CreateRepoUseCase(repos, new CoreHttpClientStub());
    const created = await create.execute({
      url: 'https://github.com/org/payment-service.git',
      authType: 'https',
    });
    const core = new CoreHttpClientStub();
    const removeSpy = vi.spyOn(core, 'removeIndex');
    const update = new UpdateRepoMetadataUseCase(repos, core);
    const result = await update.execute(created.id, {
      indexedInSearch: false,
    });
    expect(result.indexedInSearch).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith(created.id);
  });
});

describe('DeleteRepoUseCase', () => {
  it('deletes existing repo', async () => {
    const repos = createMockRepoRepo();
    const create = new CreateRepoUseCase(repos, new CoreHttpClientStub());
    const created = await create.execute({
      url: 'https://github.com/org/payment-service.git',
      authType: 'https',
    });
    const ok = await new DeleteRepoUseCase(repos).execute(created.id);
    expect(ok).toBe(true);
    expect(await repos.findById(created.id)).toBeUndefined();
  });
});
