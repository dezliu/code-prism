import { Model, snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';
import { RepoMetadataModel } from './repo-metadata.model.js';

export type AuthType = 'ssh' | 'https';
export type ConnectionStatus = 'pending' | 'connected' | 'failed' | 'disabled';
export type IndexStatus = 'none' | 'queued' | 'indexing' | 'indexed' | 'failed' | 'removed';

export class RepoModel extends BaseModel {
  static tableName = 'repos';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  url!: string;
  name!: string;
  authType!: AuthType;
  authConfig!: Record<string, unknown> | null;
  defaultBranch!: string;
  branchPolicy!: Record<string, unknown> | null;
  connectionStatus!: ConnectionStatus;
  connectionError!: string | null;
  languageSummary!: Record<string, number> | null;
  lastCommitAt!: Date | null;
  lastCommitSummary!: string | null;
  enabled!: boolean;
  indexedInSearch!: boolean;
  indexStatus!: IndexStatus;
  createdAt!: Date;
  updatedAt!: Date;

  static get jsonAttributes() {
    return ['authConfig', 'branchPolicy', 'languageSummary'];
  }

  metadata?: RepoMetadataModel;

  static get relationMappings() {
    return {
      metadata: {
        relation: Model.HasOneRelation,
        modelClass: RepoMetadataModel,
        join: { from: 'repos.id', to: 'repo_metadata.repo_id' },
      },
    };
  }
}
