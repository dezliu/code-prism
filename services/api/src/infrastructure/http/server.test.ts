import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { createApp, mountGraphQL } from './server';
import type { ApiConfig } from '../../config';
import type { GraphQLContext } from '../../graphql/resolvers/index';

const testConfig: ApiConfig = {
  port: 0,
  nodeEnv: 'test',
  logLevel: 'error',
  databaseUrl: 'mysql://test:test@localhost:3306/test',
  redisUrl: 'redis://localhost:6379/0',
  coreGrpcAddr: 'localhost:50051',
  jwtSecret: 'test-secret',
  jwtExpiresIn: '1h',
};

describe('GET /health', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp({ config: testConfig });
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
    app = createApp({ config: testConfig });
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

  it('should return empty repos list from scaffold stub', async () => {
    const response = await request(app)
      .post('/graphql')
      .send({ query: '{ repos { id name } }' });

    expect(response.status).toBe(200);
    expect(response.body.data.repos).toEqual([]);
  });
});

describe('POST /api/chat/stream (placeholder)', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp({ config: testConfig });
  });

  it('should return 501 not implemented for SSE stream placeholder', async () => {
    const response = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'hello' });

    expect(response.status).toBe(501);
    expect(response.body.code).toBe('NOT_IMPLEMENTED');
  });
});
