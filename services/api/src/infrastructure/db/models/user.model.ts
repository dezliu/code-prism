import { Model, snakeCaseMappers } from 'objection';

export class BaseModel extends Model {
  static get idColumn() {
    return 'id';
  }
}

export class UserModel extends BaseModel {
  static tableName = 'users';
  static columnNameMappers = snakeCaseMappers();

  id!: string;
  email!: string;
  passwordHash!: string;
  displayName!: string;
  role!: string;
  teamId!: string | null;
  createdAt!: string;
}
