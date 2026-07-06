import { UserModel } from '../models/user.model.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  teamId: string | null;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  displayName: string;
  role: string;
  teamId: string | null;
  createdAt: string;
}

function toRecord(model: UserModel): UserRecord {
  return {
    id: model.id,
    email: model.email,
    passwordHash: model.passwordHash,
    displayName: model.displayName,
    role: model.role,
    teamId: model.teamId,
    createdAt: model.createdAt,
  };
}

export function toPublicUser(user: UserRecord): UserPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    teamId: user.teamId,
    createdAt: user.createdAt,
  };
}

export class UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await UserModel.query().findOne({ email });
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await UserModel.query().findById(id);
    return row ? toRecord(row) : null;
  }
}
