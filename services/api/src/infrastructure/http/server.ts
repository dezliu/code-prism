import express, { type Express } from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { randomUUID } from 'node:crypto';
import type { ApiConfig } from '../../config.js';
import { typeDefs } from '../../graphql/schema/index.js';
import { createResolvers, type GraphQLContext } from '../../graphql/resolvers/index.js';
import { LoginUseCase } from '../../application/auth/login.js';
import { GetCurrentUserUseCase } from '../../application/auth/get-current-user.js';
import { ListReposUseCaseStub } from '../../application/repo/list-repos.js';
import { ListKnowledgeDocsUseCaseStub } from '../../application/knowledge/list-knowledge-docs.js';
import { ListChatSessionsUseCaseStub } from '../../application/chat/list-chat-sessions.js';
import { ListIndexJobsUseCaseStub } from '../../application/monitor/list-index-jobs.js';
import { UserRepository } from '../../infrastructure/db/repositories/user.repository.js';
import {
  AiWorkerHttpStreamClient,
  type AiWorkerStreamClient,
} from '../../infrastructure/clients/ai-worker.client.js';
import { extractBearerToken, verifyAccessToken } from '../../infrastructure/auth/jwt.js';
import { RedisStreamCancelStore, type StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import { createHealthRouter } from './health.js';
import { createChatRoutes } from './chat-routes.js';
import { createCorsMiddleware } from './cors.js';

export interface HttpServerDeps {
  config: ApiConfig;
  aiWorkerClient?: AiWorkerStreamClient;
  cancelStore?: StreamCancelStore;
}

export function createApp(deps: HttpServerDeps): Express {
  const app = express();
  const aiWorkerClient = deps.aiWorkerClient ?? new AiWorkerHttpStreamClient(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);

  app.use(createCorsMiddleware(deps.config));
  app.use(express.json());
  app.use(createHealthRouter());
  app.use(createChatRoutes({ config: deps.config, aiWorkerClient, cancelStore }));

  return app;
}

function buildGraphQLContext(config: ApiConfig, req: express.Request): GraphQLContext {
  const userRepo = new UserRepository();
  let auth: GraphQLContext['auth'] = null;

  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      auth = verifyAccessToken(config, token);
    } catch {
      auth = null;
    }
  }

  return {
    traceId: randomUUID(),
    auth,
    loginUseCase: new LoginUseCase(userRepo, config),
    getCurrentUserUseCase: new GetCurrentUserUseCase(userRepo),
    listReposUseCase: new ListReposUseCaseStub(),
    listKnowledgeDocsUseCase: new ListKnowledgeDocsUseCaseStub(),
    listChatSessionsUseCase: new ListChatSessionsUseCaseStub(),
    listIndexJobsUseCase: new ListIndexJobsUseCaseStub(),
  };
}

export async function mountGraphQL(app: Express, config: ApiConfig): Promise<ApolloServer<GraphQLContext>> {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers: createResolvers(),
  });

  await server.start();

  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<GraphQLContext> => buildGraphQLContext(config, req),
    }),
  );

  return server;
}

export async function startHttpServer(deps: HttpServerDeps): Promise<{
  app: Express;
  apolloServer: ApolloServer<GraphQLContext>;
  port: number;
}> {
  const app = createApp(deps);
  const apolloServer = await mountGraphQL(app, deps.config);

  return {
    app,
    apolloServer,
    port: deps.config.port,
  };
}
