import { ApplicationError } from '../../domain/errors.js';
import {
  toPublicUser,
  UserRepository,
  type UserPublic,
} from '../../infrastructure/db/repositories/user.repository.js';

export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string | undefined): Promise<UserPublic | null> {
    if (!userId) {
      return null;
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new ApplicationError('User not found', 'NOT_FOUND');
    }

    return toPublicUser(user);
  }
}
