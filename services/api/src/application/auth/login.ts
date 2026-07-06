import { ApplicationError } from '../../domain/errors.js';
import { verifyPassword } from '../../infrastructure/auth/password.js';
import { signAccessToken } from '../../infrastructure/auth/jwt.js';
import {
  toPublicUser,
  UserRepository,
  type UserPublic,
} from '../../infrastructure/db/repositories/user.repository.js';
import type { ApiConfig } from '../../config.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: UserPublic;
}

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly config: ApiConfig,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new ApplicationError('Email and password are required', 'VALIDATION_ERROR');
    }

    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const token = signAccessToken(this.config, {
      userId: user.id,
      role: user.role,
    });

    return {
      token,
      user: toPublicUser(user),
    };
  }
}
