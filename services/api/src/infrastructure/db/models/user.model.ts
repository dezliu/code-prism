import { Model } from 'objection';

export class BaseModel extends Model {
  static get idColumn() {
    return 'id';
  }
}

/** 占位模型 — Batch 3 local-auth-minimal 将扩展 users 表 */
export class UserModel extends BaseModel {
  static tableName = 'users';

  id!: string;
  email!: string;
  passwordHash!: string;
  displayName!: string;
  role!: string;
  teamId!: string | null;
  createdAt!: string;
}
