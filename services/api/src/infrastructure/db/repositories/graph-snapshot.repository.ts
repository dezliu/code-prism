import { randomUUID } from 'node:crypto';
import { GraphSnapshotModel, type GraphData } from '../models/graph-snapshot.model.js';

export class GraphSnapshotRepository {
  async insertDraft(repoId: string, graphData: GraphData): Promise<GraphSnapshotModel> {
    const id = randomUUID();
    return GraphSnapshotModel.transaction(async (trx) => {
      await GraphSnapshotModel.query(trx)
        .where('repo_id', repoId)
        .where('is_official', false)
        .delete();

      await GraphSnapshotModel.query(trx).insert({
        id,
        repoId,
        version: 1,
        isOfficial: false,
        graphData,
        versionNote: null,
        publishedAt: null,
      });
      return GraphSnapshotModel.query(trx).findById(id).throwIfNotFound();
    });
  }
}
