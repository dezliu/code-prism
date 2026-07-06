import { randomUUID } from 'node:crypto';
import { GraphSnapshotModel, type GraphData } from '../models/graph-snapshot.model.js';

export class GraphSnapshotRepository {
  async insertDraft(repoId: string, graphData: GraphData): Promise<GraphSnapshotModel> {
    const id = randomUUID();
    await GraphSnapshotModel.query().insert({
      id,
      repoId,
      version: 1,
      isOfficial: false,
      graphData,
      versionNote: null,
      publishedAt: null,
    });
    return GraphSnapshotModel.query().findById(id).throwIfNotFound();
  }
}
