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
  DeleteRepoUseCase,
} from '../application/repo/repo.use-cases.js';
import {
  ListKnowledgeBasesUseCase,
  GetKnowledgeBaseUseCase,
  CreateKnowledgeBaseUseCase,
  UpdateKnowledgeBaseUseCase,
  DeleteKnowledgeBaseUseCase,
  GetKnowledgeDocItemUseCase,
  CreateKnowledgeDocItemUseCase,
  UpdateKnowledgeDocItemUseCase,
  PublishKnowledgeDocItemUseCase,
  UpdateKnowledgeDocItemIndexUseCase,
  ListKnowledgeDocsUseCase,
  GetKnowledgeDocUseCase,
  CreateKnowledgeDocUseCase,
  UpdateKnowledgeDocUseCase,
  PublishKnowledgeDocUseCase,
  GenerateKnowledgeDocContentUseCase,
  GenerateTrainingDocUseCase,
} from '../application/knowledge/knowledge.use-cases.js';
import {
  RunDocGenerateJobUseCase,
  EnqueueDocGenerateJobUseCase,
  ListDocGenerateJobsUseCase,
  GetDocGenerateJobUseCase,
  CancelDocGenerateJobUseCase,
  ApplyDocGenerateJobUseCase,
  FailStaleDocGenerateJobsUseCase,
} from '../application/knowledge/doc-generate-job.use-cases.js';
import {
  ListChatSessionsUseCase,
  CreateChatSessionUseCase,
  DeleteChatSessionUseCase,
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
  ListAdminArchitecturesUseCase,
  AddManagedArchitectureUseCase,
} from '../application/architecture/architecture.use-cases.js';
import {
  RunArchGenerateJobUseCase,
  EnqueueArchGenerateJobUseCase,
  ListArchGenerateJobsUseCase,
  GetArchGenerateJobUseCase,
  CancelArchGenerateJobUseCase,
  FailStaleArchGenerateJobsUseCase,
} from '../application/architecture/arch-generate-job.use-cases.js';
import {
  ListQaTemplatesUseCase,
  ListEnabledQaTemplatesUseCase,
  CreateQaTemplateUseCase,
  UpdateQaTemplateUseCase,
  DeleteQaTemplateUseCase,
  PreviewQaTemplateUseCase,
} from '../application/template/template.use-cases.js';
import {
  ListAlertRulesUseCase,
  CreateAlertRuleUseCase,
  UpdateAlertRuleUseCase,
  DeleteAlertRuleUseCase,
} from '../application/alert/alert.use-cases.js';
import { UserRepository } from '../infrastructure/db/repositories/user.repository.js';
import { RepoRepository } from '../infrastructure/db/repositories/repo.repository.js';
import { KnowledgeRepository } from '../infrastructure/db/repositories/knowledge.repository.js';
import { QaTemplateRepository } from '../infrastructure/db/repositories/qa-template.repository.js';
import { AlertRuleRepository } from '../infrastructure/db/repositories/alert-rule.repository.js';
import { ChatRepository } from '../infrastructure/db/repositories/chat.repository.js';
import { MonitorRepository } from '../infrastructure/db/repositories/monitor.repository.js';
import {
  createCoreHttpClient,
  resolveCoreHttpBaseUrls,
  type CoreHttpClient,
} from '../infrastructure/clients/core-http.client.js';
import { createAiWorkerDocClient } from '../infrastructure/clients/ai-worker-doc.client.js';
import { createAiWorkerArchClient } from '../infrastructure/clients/ai-worker-arch.client.js';
import {
  AiWorkerHttpStreamClient,
  type AiWorkerStreamClient,
} from '../infrastructure/clients/ai-worker.client.js';
import {
  RedisStreamCancelStore,
  type StreamCancelStore,
} from '../infrastructure/clients/stream-cancel.store.js';
import { DocGenerateJobRepository } from '../infrastructure/db/repositories/doc-generate-job.repository.js';
import { ArchGenerateJobRepository } from '../infrastructure/db/repositories/arch-generate-job.repository.js';
import { GraphSnapshotRepository } from '../infrastructure/db/repositories/graph-snapshot.repository.js';
import { ArchitectureManagedRepoRepository } from '../infrastructure/db/repositories/architecture-managed-repo.repository.js';
import { extractBearerToken, verifyAccessToken } from '../infrastructure/auth/jwt.js';
import type { GraphQLContext } from './resolvers/index.js';

export interface GraphQLContextDeps {
  config: ApiConfig;
  coreClient?: CoreHttpClient;
  aiWorkerStreamClient?: AiWorkerStreamClient;
  cancelStore?: StreamCancelStore;
}

export function buildGraphQLContext(
  config: ApiConfig,
  req: express.Request,
  deps?: GraphQLContextDeps,
): GraphQLContext {
  const userRepo = new UserRepository();
  const repoRepo = new RepoRepository();
  const knowledgeRepo = new KnowledgeRepository();
  const templateRepo = new QaTemplateRepository();
  const alertRepo = new AlertRuleRepository();
  const chatRepo = new ChatRepository();
  const monitorRepo = new MonitorRepository();
  const core = deps?.coreClient ?? createCoreHttpClient(resolveCoreHttpBaseUrls());
  const aiWorkerDoc = createAiWorkerDocClient(config);
  const aiWorkerArch = createAiWorkerArchClient(config);
  const aiWorkerStream = deps?.aiWorkerStreamClient ?? new AiWorkerHttpStreamClient(config);
  const cancelStore = deps?.cancelStore ?? new RedisStreamCancelStore(config);
  const docGenerateJobRepo = new DocGenerateJobRepository();
  const archGenerateJobRepo = new ArchGenerateJobRepository();
  const graphSnapshotRepo = new GraphSnapshotRepository();
  const architectureManagedRepo = new ArchitectureManagedRepoRepository();
  const runDocGenerateJobUseCase = new RunDocGenerateJobUseCase(
    docGenerateJobRepo,
    knowledgeRepo,
    repoRepo,
    core,
    aiWorkerStream,
    cancelStore,
  );
  const runArchGenerateJobUseCase = new RunArchGenerateJobUseCase(
    archGenerateJobRepo,
    repoRepo,
    monitorRepo,
    graphSnapshotRepo,
    core,
    aiWorkerArch,
    cancelStore,
  );

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
    deleteRepoUseCase: new DeleteRepoUseCase(repoRepo),
    listKnowledgeBasesUseCase: new ListKnowledgeBasesUseCase(knowledgeRepo),
    getKnowledgeBaseUseCase: new GetKnowledgeBaseUseCase(knowledgeRepo),
    createKnowledgeBaseUseCase: new CreateKnowledgeBaseUseCase(knowledgeRepo),
    updateKnowledgeBaseUseCase: new UpdateKnowledgeBaseUseCase(knowledgeRepo),
    deleteKnowledgeBaseUseCase: new DeleteKnowledgeBaseUseCase(knowledgeRepo),
    getKnowledgeDocItemUseCase: new GetKnowledgeDocItemUseCase(knowledgeRepo),
    createKnowledgeDocItemUseCase: new CreateKnowledgeDocItemUseCase(knowledgeRepo),
    updateKnowledgeDocItemUseCase: new UpdateKnowledgeDocItemUseCase(knowledgeRepo),
    publishKnowledgeDocItemUseCase: new PublishKnowledgeDocItemUseCase(knowledgeRepo),
    updateKnowledgeDocItemIndexUseCase: new UpdateKnowledgeDocItemIndexUseCase(knowledgeRepo, core),
    listKnowledgeDocsUseCase: new ListKnowledgeDocsUseCase(knowledgeRepo),
    getKnowledgeDocUseCase: new GetKnowledgeDocUseCase(knowledgeRepo),
    createKnowledgeDocUseCase: new CreateKnowledgeDocUseCase(knowledgeRepo),
    updateKnowledgeDocUseCase: new UpdateKnowledgeDocUseCase(knowledgeRepo),
    publishKnowledgeDocUseCase: new PublishKnowledgeDocUseCase(knowledgeRepo),
    generateKnowledgeDocContentUseCase: new GenerateKnowledgeDocContentUseCase(
      knowledgeRepo,
      repoRepo,
      core,
      aiWorkerDoc,
    ),
    generateTrainingDocUseCase: new GenerateTrainingDocUseCase(
      knowledgeRepo,
      repoRepo,
      core,
      aiWorkerDoc,
    ),
    enqueueDocGenerateJobUseCase: new EnqueueDocGenerateJobUseCase(
      docGenerateJobRepo,
      knowledgeRepo,
      runDocGenerateJobUseCase,
    ),
    listDocGenerateJobsUseCase: new ListDocGenerateJobsUseCase(docGenerateJobRepo, knowledgeRepo),
    getDocGenerateJobUseCase: new GetDocGenerateJobUseCase(docGenerateJobRepo, knowledgeRepo),
    cancelDocGenerateJobUseCase: new CancelDocGenerateJobUseCase(
      docGenerateJobRepo,
      knowledgeRepo,
      cancelStore,
    ),
    applyDocGenerateJobUseCase: new ApplyDocGenerateJobUseCase(docGenerateJobRepo, knowledgeRepo),
    listChatSessionsUseCase: new ListChatSessionsUseCase(chatRepo),
    createChatSessionUseCase: new CreateChatSessionUseCase(chatRepo),
    deleteChatSessionUseCase: new DeleteChatSessionUseCase(chatRepo),
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
    generateArchDraftUseCase: new GenerateArchDraftUseCase(
      repoRepo,
      monitorRepo,
      graphSnapshotRepo,
      core,
      aiWorkerArch,
      cancelStore,
    ),
    enqueueArchGenerateJobUseCase: new EnqueueArchGenerateJobUseCase(
      archGenerateJobRepo,
      repoRepo,
      runArchGenerateJobUseCase,
    ),
    listArchGenerateJobsUseCase: new ListArchGenerateJobsUseCase(archGenerateJobRepo, repoRepo),
    getArchGenerateJobUseCase: new GetArchGenerateJobUseCase(archGenerateJobRepo, repoRepo),
    cancelArchGenerateJobUseCase: new CancelArchGenerateJobUseCase(
      archGenerateJobRepo,
      repoRepo,
      cancelStore,
    ),
    publishOfficialArchitectureUseCase: new PublishOfficialArchitectureUseCase(
      monitorRepo,
      repoRepo,
    ),
    listAdminArchitecturesUseCase: new ListAdminArchitecturesUseCase(
      monitorRepo,
      repoRepo,
      architectureManagedRepo,
    ),
    addManagedArchitectureUseCase: new AddManagedArchitectureUseCase(
      architectureManagedRepo,
      monitorRepo,
      repoRepo,
    ),
    listQaTemplatesUseCase: new ListQaTemplatesUseCase(templateRepo),
    listEnabledQaTemplatesUseCase: new ListEnabledQaTemplatesUseCase(templateRepo),
    createQaTemplateUseCase: new CreateQaTemplateUseCase(templateRepo),
    updateQaTemplateUseCase: new UpdateQaTemplateUseCase(templateRepo),
    deleteQaTemplateUseCase: new DeleteQaTemplateUseCase(templateRepo),
    previewQaTemplateUseCase: new PreviewQaTemplateUseCase(),
    listAlertRulesUseCase: new ListAlertRulesUseCase(alertRepo),
    createAlertRuleUseCase: new CreateAlertRuleUseCase(alertRepo),
    updateAlertRuleUseCase: new UpdateAlertRuleUseCase(alertRepo),
    deleteAlertRuleUseCase: new DeleteAlertRuleUseCase(alertRepo),
  };
}
