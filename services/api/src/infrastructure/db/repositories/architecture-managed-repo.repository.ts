import { ArchitectureManagedRepoModel } from '../models/architecture-managed-repo.model.js';

export class ArchitectureManagedRepoRepository {
  async listRepoIds(): Promise<string[]> {
    const rows = await ArchitectureManagedRepoModel.query()
      .select('repo_id')
      .orderBy('created_at', 'desc');
    return rows.map((row) => row.repoId);
  }

  async has(repoId: string): Promise<boolean> {
    const row = await ArchitectureManagedRepoModel.query().findById(repoId);
    return Boolean(row);
  }

  async add(repoId: string): Promise<ArchitectureManagedRepoModel> {
    const existing = await ArchitectureManagedRepoModel.query().findById(repoId);
    if (existing) {
      return existing;
    }

    await ArchitectureManagedRepoModel.query().insert({
      repoId,
      createdAt: new Date(),
    });
    return ArchitectureManagedRepoModel.query().findById(repoId).throwIfNotFound();
  }
}
