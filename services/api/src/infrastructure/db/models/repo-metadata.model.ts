import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export class RepoMetadataModel extends BaseModel {
  static tableName = 'repo_metadata';
  static columnNameMappers = snakeCaseMappers();

  repoId!: string;
  displayName!: string;
  tags!: string[];
  businessOwner!: string | null;
  techOwner!: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  static get idColumn() {
    return 'repo_id';
  }
}
