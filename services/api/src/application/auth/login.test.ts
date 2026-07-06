import { describe, it, expect, vi } from 'vitest';
import { LoginUseCase } from './login';
import { hashPassword } from '../../infrastructure/auth/password';
import type { UserRepository, UserRecord } from '../../infrastructure/db/repositories/user.repository';
import type { ApiConfig } from '../../config';

const config: ApiConfig = {
  port: 4000,
  nodeEnv: 'test',
  logLevel: 'error',
  databaseUrl: 'mysql://test:test@localhost:3306/test',
  redisUrl: 'redis://localhost:6379/0',
  coreGrpcAddr: 'localhost:50051',
  aiWorkerUrl: 'http://localhost:8001',
  jwtSecret: 'test-secret',
  jwtExpiresIn: '1h',
};

describe('LoginUseCase', () => {
  it('should return token and user for valid credentials', async () => {
    const passwordHash = await hashPassword('lingprism123');
    const user: UserRecord = {
      id: 'user-1',
      email: 'employee@lingprism.local',
      passwordHash,
      displayName: '员工',
      role: 'employee',
      teamId: null,
      createdAt: new Date().toISOString(),
    };

    const repo: UserRepository = {
      findByEmail: vi.fn().mockResolvedValue(user),
      findById: vi.fn(),
    };

    const useCase = new LoginUseCase(repo, config);
    const result = await useCase.execute({
      email: 'employee@lingprism.local',
      password: 'lingprism123',
    });

    expect(result.user.email).toBe('employee@lingprism.local');
    expect(result.token).toBeTruthy();
  });

  it('should reject invalid password', async () => {
    const passwordHash = await hashPassword('lingprism123');
    const repo: UserRepository = {
      findByEmail: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'employee@lingprism.local',
        passwordHash,
        displayName: '员工',
        role: 'employee',
        teamId: null,
        createdAt: new Date().toISOString(),
      }),
      findById: vi.fn(),
    };

    const useCase = new LoginUseCase(repo, config);
    await expect(
      useCase.execute({ email: 'employee@lingprism.local', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
