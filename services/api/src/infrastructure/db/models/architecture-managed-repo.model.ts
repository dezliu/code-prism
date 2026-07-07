import { snakeCaseMappers } from 'objection';
import { BaseModel } from './user.model.js';

export class ArchitectureManagedRepoModel extends BaseModel {
  static tableName = 'architecture_managed_repos';
  static columnNameMappers = snakeCaseMappers();

  repoId!: string;
  createdAt!: Date;

  static get idColumn() {
    return 'repo_id';
  }
}
