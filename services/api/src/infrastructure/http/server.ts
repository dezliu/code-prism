import express, { type Express } from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import type { ApiConfig } from '../../config.js';
import { typeDefs } from '../../graphql/schema/index.js';
import { createResolvers, type GraphQLContext } from '../../graphql/resolvers/index.js';
import { ListReposUseCaseStub } from '../../application/repo/list-repos.js';
import { ListKnowledgeDocsUseCaseStub } from '../../application/knowledge/list-knowledge-docs.js';
import { ListChatSessionsUseCaseStub } from '../../application/chat/list-chat-sessions.js';
import { ListIndexJobsUseCaseStub } from '../../application/monitor/list-index-jobs.js';
import { createHealthRouter } from './health.js';
import { createChatRoutes } from './chat-routes.js';
import { randomUUID } from 'node:crypto';

export interface HttpServerDeps {
  config: ApiConfig;
}

export function createApp(deps: HttpServerDeps): Express {
  const app = express();

  app.use(express.json());
  app.use(createHealthRouter());
  app.use(createChatRoutes());

  return app;
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
      context: async (): Promise<GraphQLContext> => ({
        traceId: randomUUID(),
        listReposUseCase: new ListReposUseCaseStub(),
        listKnowledgeDocsUseCase: new ListKnowledgeDocsUseCaseStub(),
        listChatSessionsUseCase: new ListChatSessionsUseCaseStub(),
        listIndexJobsUseCase: new ListIndexJobsUseCaseStub(),
      }),
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
