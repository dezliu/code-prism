import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { ApiConfig } from '../config.js';
import { LoginUseCase } from '../application/auth/login.js';
import { GetCurrentUserUseCase } from '../application/auth/get-current-user.js';
import {
  ListReposUseCase,
  CreateRepoUseCase,
  TestRepoConnectionUseCase,
  UpdateRepoMetadataUseCase,
  UpdateRepoUseCase,
} from '../application/repo/repo.use-cases.js';
import {
  ListKnowledgeDocsUseCase,
  CreateKnowledgeDocUseCase,
  PublishKnowledgeDocUseCase,
  GenerateTrainingDocUseCase,
} from '../application/knowledge/knowledge.use-cases.js';
import {
  ListChatSessionsUseCase,
  CreateChatSessionUseCase,
  GetChatMessagesUseCase,
  PersistChatMessageUseCase,
  GetSessionContextUseCase,
} from '../application/chat/chat.use-cases.js';
import {
  ListIndexJobsUseCase,
  ListHealthScoresUseCase,
  ListArchDriftsUseCase,
  ResolveArchDriftUseCase,
  GetOfficialArchitectureUseCase,
  ListOfficialArchitecturesUseCase,
} from '../application/monitor/monitor.use-cases.js';
import {
  GetArchitectureForBrowseUseCase,
  GetArchitectureDraftUseCase,
  GenerateArchDraftUseCase,
  PublishOfficialArchitectureUseCase,
} from '../application/architecture/architecture.use-cases.js';
import { UserRepository } from '../infrastructure/db/repositories/user.repository.js';
import { RepoRepository } from '../infrastructure/db/repositories/repo.repository.js';
import { KnowledgeDocRepository } from '../infrastructure/db/repositories/knowledge-doc.repository.js';
import { ChatRepository } from '../infrastructure/db/repositories/chat.repository.js';
import { MonitorRepository } from '../infrastructure/db/repositories/monitor.repository.js';
import {
  createCoreHttpClient,
  type CoreHttpClient,
} from '../infrastructure/clients/core-http.client.js';
import { extractBearerToken, verifyAccessToken } from '../infrastructure/auth/jwt.js';
import type { GraphQLContext } from './resolvers/index.js';

export interface GraphQLContextDeps {
  config: ApiConfig;
  coreClient?: CoreHttpClient;
}

function resolveCoreHttpUrl(config: ApiConfig): string {
  return process.env.CORE_HTTP_URL ?? `http://localhost:${process.env.CORE_HTTP_PORT ?? '8080'}`;
}

export function buildGraphQLContext(
  config: ApiConfig,
  req: express.Request,
  deps?: Pick<GraphQLContextDeps, 'coreClient'>,
): GraphQLContext {
  const userRepo = new UserRepository();
  const repoRepo = new RepoRepository();
  const knowledgeRepo = new KnowledgeDocRepository();
  const chatRepo = new ChatRepository();
  const monitorRepo = new MonitorRepository();
  const core = deps?.coreClient ?? createCoreHttpClient(resolveCoreHttpUrl(config));

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
    listReposUseCase: new ListReposUseCase(repoRepo),
    createRepoUseCase: new CreateRepoUseCase(repoRepo, core),
    testRepoConnectionUseCase: new TestRepoConnectionUseCase(repoRepo, core),
    updateRepoMetadataUseCase: new UpdateRepoMetadataUseCase(repoRepo, core),
    updateRepoUseCase: new UpdateRepoUseCase(repoRepo),
    listKnowledgeDocsUseCase: new ListKnowledgeDocsUseCase(knowledgeRepo),
    createKnowledgeDocUseCase: new CreateKnowledgeDocUseCase(knowledgeRepo),
    publishKnowledgeDocUseCase: new PublishKnowledgeDocUseCase(knowledgeRepo),
    generateTrainingDocUseCase: new GenerateTrainingDocUseCase(knowledgeRepo, core),
    listChatSessionsUseCase: new ListChatSessionsUseCase(chatRepo),
    createChatSessionUseCase: new CreateChatSessionUseCase(chatRepo),
    getChatMessagesUseCase: new GetChatMessagesUseCase(chatRepo),
    persistChatMessageUseCase: new PersistChatMessageUseCase(chatRepo),
    getSessionContextUseCase: new GetSessionContextUseCase(chatRepo),
    listIndexJobsUseCase: new ListIndexJobsUseCase(monitorRepo, repoRepo),
    listHealthScoresUseCase: new ListHealthScoresUseCase(monitorRepo, repoRepo),
    listArchDriftsUseCase: new ListArchDriftsUseCase(monitorRepo, repoRepo),
    resolveArchDriftUseCase: new ResolveArchDriftUseCase(monitorRepo, repoRepo),
    getOfficialArchitectureUseCase: new GetOfficialArchitectureUseCase(monitorRepo, repoRepo),
    listOfficialArchitecturesUseCase: new ListOfficialArchitecturesUseCase(monitorRepo, repoRepo),
    getArchitectureForBrowseUseCase: new GetArchitectureForBrowseUseCase(monitorRepo, repoRepo),
    getArchitectureDraftUseCase: new GetArchitectureDraftUseCase(monitorRepo, repoRepo),
    generateArchDraftUseCase: new GenerateArchDraftUseCase(core, monitorRepo, repoRepo),
    publishOfficialArchitectureUseCase: new PublishOfficialArchitectureUseCase(
      monitorRepo,
      repoRepo,
    ),
  };
}
