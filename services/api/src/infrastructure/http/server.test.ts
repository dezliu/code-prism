import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp, mountGraphQL } from './server';
import type { ApiConfig } from '../../config';
import type { GraphQLContext } from '../../graphql/resolvers/index';
import {
  AiWorkerHttpStreamClient,
  MockAiWorkerStreamClient,
  type AiWorkerStreamClient,
} from '../clients/ai-worker.client';
import { MemoryStreamCancelStore } from '../clients/stream-cancel.store';
import { signAccessToken } from '../auth/jwt';
import { hashPassword } from '../auth/password';
import { LoginUseCase } from '../../application/auth/login';
import { UserRepository } from '../db/repositories/user.repository';

const testConfig: ApiConfig = {
  port: 0,
  nodeEnv: 'test',
  logLevel: 'error',
  databaseUrl: 'mysql://test:test@localhost:3306/test',
  redisUrl: 'redis://localhost:6379/15',
  coreGrpcAddr: 'localhost:50051',
  aiWorkerUrl: 'http://localhost:8001',
  jwtSecret: 'test-secret',
  jwtExpiresIn: '1h',
  corsOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
};

function authHeader(userId = 'user-1', role = 'employee'): string {
  const token = signAccessToken(testConfig, { userId, role });
  return `Bearer ${token}`;
}

function createTestApp(aiWorkerClient?: AiWorkerStreamClient) {
  return createApp({
    config: testConfig,
    aiWorkerClient: aiWorkerClient ?? new MockAiWorkerStreamClient(),
    cancelStore: new MemoryStreamCancelStore(),
    usePersistence: false,
  });
}

describe('CORS', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should respond to graphql preflight with allow-origin', async () => {
    const response = await request(app)
      .options('/graphql')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });

  it('should omit allow-origin for unknown origins', async () => {
    const response = await request(app)
      .options('/graphql')
      .set('Origin', 'http://evil.example.com');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should allow 127.0.0.1 alias when localhost is configured', async () => {
    const response = await request(app)
      .options('/graphql')
      .set('Origin', 'http://127.0.0.1:3000')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
  });

  it('should allow admin.localhost when localhost port is configured', async () => {
    const dockerLikeApp = createApp({
      config: {
        ...testConfig,
        corsOrigins: ['http://localhost:8080'],
      },
      cancelStore: new MemoryStreamCancelStore(),
      usePersistence: false,
    });

    const response = await request(dockerLikeApp)
      .options('/api/architecture/generate/stream')
      .set('Origin', 'http://admin.localhost:8080')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://admin.localhost:8080');
  });
});

describe('GET /health', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should return ok status when health endpoint is called', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api',
    });
    expect(response.body.timestamp).toBeDefined();
  });
});

describe('GraphQL', () => {
  let app: Express;
  let apolloServer: ApolloServer<GraphQLContext>;

  beforeAll(async () => {
    app = createTestApp();
    apolloServer = await mountGraphQL(app, testConfig);
  });

  afterAll(async () => {
    await apolloServer.stop();
  });

  it('should return Query typename for introspection query', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ __typename }' });

    expect(response.status).toBe(200);
    expect(response.body.data.__typename).toBe('Query');
  });

  it('should return health status from health query', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ health { status service } }' });

    expect(response.status).toBe(200);
    expect(response.body.data.health).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('should require auth for repos query', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ repos { id name } }' });

    expect(response.status).toBe(200);
    expect(response.body.errors?.[0]?.message).toContain('UNAUTHORIZED');
  });
});

describe('POST /api/chat/stream', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp(new MockAiWorkerStreamClient(['你', '好']));
  });

  it('should reject unauthenticated requests', async () => {
    const response = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hello' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('should stream SSE events for authenticated requests', async () => {
    const response = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', authHeader())
      .send({ message: 'hello' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.text).toContain('event: status');
    expect(response.text).toContain('event: token');
    expect(response.text).toContain('event: done');
    expect(response.headers['x-stream-id']).toBeDefined();
  });
});

describe('POST /api/chat/stop', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should require streamId', async () => {
    const response = await request(app)
      .post('/api/chat/stop')
      .set('Authorization', authHeader())
      .send({});

    expect(response.status).toBe(400);
  });

  it('should accept stop request with streamId', async () => {
    const response = await request(app)
      .post('/api/chat/stop')
      .set('Authorization', authHeader())
      .send({ streamId: 'stream-test-001' });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe('LoginUseCase integration (no DB)', () => {
  it('should produce verifiable JWT', async () => {
    const passwordHash = await hashPassword('lingprism123');
    const repo = {
      findByEmail: async () => ({
        id: '00000000-0000-4000-8000-000000000002',
        email: 'employee@lingprism.local',
        passwordHash,
        displayName: '普通员工',
        role: 'employee',
        teamId: null,
        createdAt: '2026-07-06T00:00:00.000Z',
      }),
      findById: async () => null,
    } as UserRepository;

    const result = await new LoginUseCase(repo, testConfig).execute({
      email: 'employee@lingprism.local',
      password: 'lingprism123',
    });

    expect(result.user.role).toBe('employee');
    expect(result.token.split('.')).toHaveLength(3);
  });
});
