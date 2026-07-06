import { IndexJobModel } from '../models/index-job.model.js';
import { HealthScoreModel } from '../models/health-score.model.js';
import { ArchDriftModel } from '../models/arch-drift.model.js';
import { GraphSnapshotModel } from '../models/graph-snapshot.model.js';

export class MonitorRepository {
  async listIndexJobs(): Promise<IndexJobModel[]> {
    return IndexJobModel.query().orderBy('created_at', 'desc');
  }

  async listHealthScores(): Promise<HealthScoreModel[]> {
    return HealthScoreModel.query().orderBy('score', 'asc');
  }

  async listArchDrifts(status?: string): Promise<ArchDriftModel[]> {
    let query = ArchDriftModel.query().orderBy('detected_at', 'desc');
    if (status) {
      query = query.where('status', status);
    }
    return query;
  }

  async getOfficialArchitecture(repoId: string): Promise<GraphSnapshotModel | undefined> {
    return GraphSnapshotModel.query()
      .where('repo_id', repoId)
      .where('is_official', true)
      .orderBy('version', 'desc')
      .first();
  }

  async listOfficialArchitectures(): Promise<GraphSnapshotModel[]> {
    return GraphSnapshotModel.query()
      .where('is_official', true)
      .orderBy('published_at', 'desc');
  }

  async getDraftArchitecture(repoId: string): Promise<GraphSnapshotModel | undefined> {
    return GraphSnapshotModel.query()
      .where('repo_id', repoId)
      .where('is_official', false)
      .orderBy('created_at', 'desc')
      .first();
  }

  async updateArchDriftStatus(id: string, status: string): Promise<ArchDriftModel> {
    await ArchDriftModel.query().findById(id).patch({ status });
    return ArchDriftModel.query().findById(id).throwIfNotFound();
  }
}
