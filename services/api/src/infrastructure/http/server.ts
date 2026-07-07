import express, { type Express } from 'express';
import type { Server as HttpServer } from 'node:http';
import { createServer } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@apollo/server/express4';
import type { ApiConfig } from '../../config.js';
import { typeDefs } from '../../graphql/schema/index.js';
import { createResolvers, type GraphQLContext } from '../../graphql/resolvers/index.js';
import {
  AiWorkerHttpStreamClient,
  type AiWorkerStreamClient,
} from '../../infrastructure/clients/ai-worker.client.js';
import { createHealthRouter } from './health.js';
import { createChatRoutes } from './chat-routes.js';
import { createMcpInternalRoutes } from './mcp-internal-routes.js';
import { createKnowledgeDocRoutes } from './knowledge-doc-routes.js';
import { createArchitectureRoutes } from './architecture-routes.js';
import { RedisStreamCancelStore, type StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';
import { createCorsMiddleware } from './cors.js';
import { buildGraphQLContext } from '../../graphql/context-factory.js';

export interface HttpServerDeps {
  config: ApiConfig;
  aiWorkerClient?: AiWorkerStreamClient;
  cancelStore?: StreamCancelStore;
  usePersistence?: boolean;
}

export function createApp(deps: HttpServerDeps): Express {
  const app = express();
  const aiWorkerClient = deps.aiWorkerClient ?? new AiWorkerHttpStreamClient(deps.config);
  const cancelStore = deps.cancelStore ?? new RedisStreamCancelStore(deps.config);

  app.use(createCorsMiddleware(deps.config));
  app.use(express.json());
  app.use(createHealthRouter());
  app.use(createChatRoutes({
    config: deps.config,
    aiWorkerClient,
    cancelStore,
    usePersistence: deps.usePersistence,
  }));
  app.use(createMcpInternalRoutes({
    config: deps.config,
    aiWorkerClient,
    cancelStore,
  }));
  app.use(createKnowledgeDocRoutes({
    config: deps.config,
    aiWorkerClient,
    cancelStore,
  }));
  app.use(createArchitectureRoutes({
    config: deps.config,
    cancelStore,
  }));

  return app;
}

function buildContext(config: ApiConfig, req: express.Request): GraphQLContext {
  return buildGraphQLContext(config, req);
}

export async function mountGraphQL(
  app: Express,
  config: ApiConfig,
  httpServer?: HttpServer,
): Promise<ApolloServer<GraphQLContext>> {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers: createResolvers(),
    plugins: [
      ...(httpServer ? [ApolloServerPluginDrainHttpServer({ httpServer })] : []),
    ],
  });

  await server.start();

  app.use(
    '/graphql',
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }): Promise<GraphQLContext> => buildContext(config, req),
    }),
  );

  return server;
}

export async function startHttpServer(deps: HttpServerDeps): Promise<{
  app: Express;
  httpServer: HttpServer;
  apolloServer: ApolloServer<GraphQLContext>;
  port: number;
}> {
  const app = createApp(deps);
  const httpServer = createServer(app);
  const apolloServer = await mountGraphQL(app, deps.config, httpServer);

  return {
    app,
    httpServer,
    apolloServer,
    port: deps.config.port,
  };
}
