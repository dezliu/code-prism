import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export interface GraphNode {
  id: string;
  label: string;
  type: 'service' | 'module' | 'database';
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphSnapshotModel extends BaseModel {
  static tableName = 'graph_snapshots';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  repoId!: string;
  version!: number;
  isOfficial!: boolean;
  graphData!: GraphData;
  versionNote!: string | null;
  publishedAt!: Date | null;
  createdAt!: Date;

  static get jsonAttributes() {
    return ['graphData'];
  }
}
