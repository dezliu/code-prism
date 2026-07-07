import { GraphQLScalarType } from 'graphql';
import type { LoginUseCase } from '../../application/auth/login.js';
import type { GetCurrentUserUseCase } from '../../application/auth/get-current-user.js';
import type { ListReposUseCase, CreateRepoUseCase, TestRepoConnectionUseCase, UpdateRepoMetadataUseCase, UpdateRepoUseCase, DeleteRepoUseCase, SyncAndIndexRepoUseCase } from '../../application/repo/repo.use-cases.js';
import type { ListKnowledgeBasesUseCase, GetKnowledgeBaseUseCase, CreateKnowledgeBaseUseCase, UpdateKnowledgeBaseUseCase, DeleteKnowledgeBaseUseCase, GetKnowledgeDocItemUseCase, CreateKnowledgeDocItemUseCase, UpdateKnowledgeDocItemUseCase, PublishKnowledgeDocItemUseCase, UpdateKnowledgeDocItemIndexUseCase, ListKnowledgeDocsUseCase, GetKnowledgeDocUseCase, CreateKnowledgeDocUseCase, UpdateKnowledgeDocUseCase, PublishKnowledgeDocUseCase, GenerateKnowledgeDocContentUseCase, GenerateTrainingDocUseCase } from '../../application/knowledge/knowledge.use-cases.js';
import type {
  EnqueueDocGenerateJobUseCase,
  ListDocGenerateJobsUseCase,
  GetDocGenerateJobUseCase,
  CancelDocGenerateJobUseCase,
  ApplyDocGenerateJobUseCase,
} from '../../application/knowledge/doc-generate-job.use-cases.js';
import type {
  ListChatSessionsUseCase,
  CreateChatSessionUseCase,
  DeleteChatSessionUseCase,
  GetChatMessagesUseCase,
  PersistChatMessageUseCase,
  GetSessionContextUseCase,
} from '../../application/chat/chat.use-cases.js';
import type {
  ListIndexJobsUseCase,
  ListHealthScoresUseCase,
  ListArchDriftsUseCase,
  ResolveArchDriftUseCase,
  GetOfficialArchitectureUseCase,
  ListOfficialArchitecturesUseCase,
} from '../../application/monitor/monitor.use-cases.js';
import type {
  GetArchitectureForBrowseUseCase,
  GetArchitectureDraftUseCase,
  GenerateArchDraftUseCase,
  PublishOfficialArchitectureUseCase,
  ListAdminArchitecturesUseCase,
  AddManagedArchitectureUseCase,
} from '../../application/architecture/architecture.use-cases.js';
import type {
  EnqueueArchGenerateJobUseCase,
  ListArchGenerateJobsUseCase,
  GetArchGenerateJobUseCase,
  CancelArchGenerateJobUseCase,
} from '../../application/architecture/arch-generate-job.use-cases.js';
import type {
  ListQaTemplatesUseCase,
  ListEnabledQaTemplatesUseCase,
  CreateQaTemplateUseCase,
  UpdateQaTemplateUseCase,
  DeleteQaTemplateUseCase,
  PreviewQaTemplateUseCase,
} from '../../application/template/template.use-cases.js';
import type {
  ListAlertRulesUseCase,
  CreateAlertRuleUseCase,
  UpdateAlertRuleUseCase,
  DeleteAlertRuleUseCase,
} from '../../application/alert/alert.use-cases.js';
import type { ResolveSymbolsUseCase } from '../../application/search/resolve-symbols.use-case.js';
import { ApplicationError } from '../../domain/errors.js';
import type { JwtPayload } from '../../infrastructure/auth/jwt.js';

export interface GraphQLContext {
  traceId: string;
  auth: JwtPayload | null;
  loginUseCase: LoginUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  listReposUseCase: ListReposUseCase;
  createRepoUseCase: CreateRepoUseCase;
  testRepoConnectionUseCase: TestRepoConnectionUseCase;
  updateRepoMetadataUseCase: UpdateRepoMetadataUseCase;
  updateRepoUseCase: UpdateRepoUseCase;
  deleteRepoUseCase: DeleteRepoUseCase;
  syncAndIndexRepoUseCase: SyncAndIndexRepoUseCase;
  listKnowledgeBasesUseCase: ListKnowledgeBasesUseCase;
  getKnowledgeBaseUseCase: GetKnowledgeBaseUseCase;
  createKnowledgeBaseUseCase: CreateKnowledgeBaseUseCase;
  updateKnowledgeBaseUseCase: UpdateKnowledgeBaseUseCase;
  deleteKnowledgeBaseUseCase: DeleteKnowledgeBaseUseCase;
  getKnowledgeDocItemUseCase: GetKnowledgeDocItemUseCase;
  createKnowledgeDocItemUseCase: CreateKnowledgeDocItemUseCase;
  updateKnowledgeDocItemUseCase: UpdateKnowledgeDocItemUseCase;
  publishKnowledgeDocItemUseCase: PublishKnowledgeDocItemUseCase;
  updateKnowledgeDocItemIndexUseCase: UpdateKnowledgeDocItemIndexUseCase;
  listKnowledgeDocsUseCase: ListKnowledgeDocsUseCase;
  getKnowledgeDocUseCase: GetKnowledgeDocUseCase;
  createKnowledgeDocUseCase: CreateKnowledgeDocUseCase;
  updateKnowledgeDocUseCase: UpdateKnowledgeDocUseCase;
  publishKnowledgeDocUseCase: PublishKnowledgeDocUseCase;
  generateKnowledgeDocContentUseCase: GenerateKnowledgeDocContentUseCase;
  generateTrainingDocUseCase: GenerateTrainingDocUseCase;
  enqueueDocGenerateJobUseCase: EnqueueDocGenerateJobUseCase;
  listDocGenerateJobsUseCase: ListDocGenerateJobsUseCase;
  getDocGenerateJobUseCase: GetDocGenerateJobUseCase;
  cancelDocGenerateJobUseCase: CancelDocGenerateJobUseCase;
  applyDocGenerateJobUseCase: ApplyDocGenerateJobUseCase;
  listChatSessionsUseCase: ListChatSessionsUseCase;
  createChatSessionUseCase: CreateChatSessionUseCase;
  deleteChatSessionUseCase: DeleteChatSessionUseCase;
  getChatMessagesUseCase: GetChatMessagesUseCase;
  persistChatMessageUseCase: PersistChatMessageUseCase;
  getSessionContextUseCase: GetSessionContextUseCase;
  listIndexJobsUseCase: ListIndexJobsUseCase;
  listHealthScoresUseCase: ListHealthScoresUseCase;
  listArchDriftsUseCase: ListArchDriftsUseCase;
  resolveArchDriftUseCase: ResolveArchDriftUseCase;
  getOfficialArchitectureUseCase: GetOfficialArchitectureUseCase;
  listOfficialArchitecturesUseCase: ListOfficialArchitecturesUseCase;
  getArchitectureForBrowseUseCase: GetArchitectureForBrowseUseCase;
  getArchitectureDraftUseCase: GetArchitectureDraftUseCase;
  generateArchDraftUseCase: GenerateArchDraftUseCase;
  publishOfficialArchitectureUseCase: PublishOfficialArchitectureUseCase;
  listAdminArchitecturesUseCase: ListAdminArchitecturesUseCase;
  addManagedArchitectureUseCase: AddManagedArchitectureUseCase;
  enqueueArchGenerateJobUseCase: EnqueueArchGenerateJobUseCase;
  listArchGenerateJobsUseCase: ListArchGenerateJobsUseCase;
  getArchGenerateJobUseCase: GetArchGenerateJobUseCase;
  cancelArchGenerateJobUseCase: CancelArchGenerateJobUseCase;
  listQaTemplatesUseCase: ListQaTemplatesUseCase;
  listEnabledQaTemplatesUseCase: ListEnabledQaTemplatesUseCase;
  createQaTemplateUseCase: CreateQaTemplateUseCase;
  updateQaTemplateUseCase: UpdateQaTemplateUseCase;
  deleteQaTemplateUseCase: DeleteQaTemplateUseCase;
  previewQaTemplateUseCase: PreviewQaTemplateUseCase;
  listAlertRulesUseCase: ListAlertRulesUseCase;
  createAlertRuleUseCase: CreateAlertRuleUseCase;
  updateAlertRuleUseCase: UpdateAlertRuleUseCase;
  deleteAlertRuleUseCase: DeleteAlertRuleUseCase;
  resolveSymbolsUseCase: ResolveSymbolsUseCase;
}

function requireAuth(ctx: GraphQLContext) {
  if (!ctx.auth?.userId) {
    throw new ApplicationError('Authentication required', 'UNAUTHORIZED');
  }
  return ctx.auth;
}

function requireAdmin(ctx: GraphQLContext) {
  const auth = requireAuth(ctx);
  if (auth.role !== 'admin' && auth.role !== 'leader') {
    throw new ApplicationError('Admin access required', 'FORBIDDEN');
  }
  return auth;
}

function formatGraphQLError(error: unknown): Error {
  if (error instanceof ApplicationError) {
    return new Error(`${error.code}: ${error.message}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function withHandler<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw formatGraphQLError(error);
  }
}

export const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: () => null,
});

export function createResolvers() {
  return {
    JSON: jsonScalar,
    Query: {
      health: () => ({
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      }),
      me: async (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.getCurrentUserUseCase.execute(ctx.auth?.userId),
      repos: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listReposUseCase.execute();
        }),
      repo: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
        requireAuth(ctx);
        const repos = await ctx.listReposUseCase.execute();
        return repos.find((r) => r.id === args.id) ?? null;
      },
      knowledgeBases: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAuth(ctx);
          const isAdmin = auth.role === 'admin' || auth.role === 'leader';
          return ctx.listKnowledgeBasesUseCase.execute({ isAdmin });
        }),
      knowledgeBase: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          const auth = requireAuth(ctx);
          const isAdmin = auth.role === 'admin' || auth.role === 'leader';
          try {
            return await ctx.getKnowledgeBaseUseCase.execute(args.id, { isAdmin });
          } catch {
            return null;
          }
        }),
      knowledgeDocItem: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          const auth = requireAuth(ctx);
          const isAdmin = auth.role === 'admin' || auth.role === 'leader';
          try {
            return await ctx.getKnowledgeDocItemUseCase.execute(args.id, { isAdmin });
          } catch {
            return null;
          }
        }),
      knowledgeDocs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listKnowledgeDocsUseCase.execute();
        }),
      knowledgeDoc: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          requireAuth(ctx);
          try {
            return await ctx.getKnowledgeDocUseCase.execute(args.id);
          } catch {
            return null;
          }
        }),
      docGenerateJobs: (
        _: unknown,
        args: { status?: string; limit?: number },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listDocGenerateJobsUseCase.execute(args);
        }),
      docGenerateJob: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          requireAdmin(ctx);
          try {
            return await ctx.getDocGenerateJobUseCase.execute(args.id);
          } catch {
            return null;
          }
        }),
      chatSessions: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAuth(ctx);
          return ctx.listChatSessionsUseCase.execute(auth.userId);
        }),
      chatMessages: (_: unknown, args: { sessionId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAuth(ctx);
          return ctx.getChatMessagesUseCase.execute(args.sessionId, auth.userId);
        }),
      resolveSymbols: (
        _: unknown,
        args: {
          input: {
            query: string;
            className?: string;
            methodName?: string;
            repoIds?: string[];
            limit?: number;
          };
        },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.resolveSymbolsUseCase.execute(args.input);
        }),
      indexJobs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listIndexJobsUseCase.execute();
        }),
      healthScores: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listHealthScoresUseCase.execute();
        }),
      archDrifts: (_: unknown, args: { status?: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listArchDriftsUseCase.execute(args.status);
        }),
      adminArchitectures: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listAdminArchitecturesUseCase.execute();
        }),
      architectureDraft: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          requireAdmin(ctx);
          try {
            return await ctx.getArchitectureDraftUseCase.execute(args.repoId);
          } catch {
            return null;
          }
        }),
      archGenerateJobs: (
        _: unknown,
        args: { status?: string; limit?: number },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listArchGenerateJobsUseCase.execute(args);
        }),
      archGenerateJob: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.getArchGenerateJobUseCase.execute(args.id);
        }),
      officialArchitectures: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listOfficialArchitecturesUseCase.execute();
        }),
      officialArchitecture: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(async () => {
          requireAuth(ctx);
          try {
            return await ctx.getOfficialArchitectureUseCase.execute(args.repoId);
          } catch {
            return null;
          }
        }),
      qaTemplates: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listQaTemplatesUseCase.execute();
        }),
      previewQaTemplate: (
        _: unknown,
        args: { id: string; sampleQuestion: string },
        ctx: GraphQLContext,
      ) =>
        withHandler(async () => {
          requireAdmin(ctx);
          const templates = await ctx.listQaTemplatesUseCase.execute();
          const template = templates.find((t) => t.id === args.id);
          if (!template) {
            throw new ApplicationError('模板不存在', 'NOT_FOUND');
          }
          return ctx.previewQaTemplateUseCase.execute(template, args.sampleQuestion);
        }),
      alertRules: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.listAlertRulesUseCase.execute();
        }),
    },
    Mutation: {
      _empty: () => null,
      login: async (
        _: unknown,
        args: { email: string; password: string },
        ctx: GraphQLContext,
      ) => withHandler(() => ctx.loginUseCase.execute(args)),
      logout: () => true,
      createRepo: (_: unknown, args: { input: Parameters<CreateRepoUseCase['execute']>[0] }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.createRepoUseCase.execute(args.input);
        }),
      testRepoConnection: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.testRepoConnectionUseCase.execute(args.repoId);
        }),
      updateRepoMetadata: (
        _: unknown,
        args: { repoId: string; input: Parameters<UpdateRepoMetadataUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateRepoMetadataUseCase.execute(args.repoId, args.input);
        }),
      updateRepo: (
        _: unknown,
        args: { repoId: string; input: Parameters<UpdateRepoUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateRepoUseCase.execute(args.repoId, args.input);
        }),
      deleteRepo: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.deleteRepoUseCase.execute(args.repoId);
        }),
      syncAndIndexRepo: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.syncAndIndexRepoUseCase.execute(args.repoId);
        }),
      createKnowledgeBase: (
        _: unknown,
        args: { input: Parameters<CreateKnowledgeBaseUseCase['execute']>[0] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.createKnowledgeBaseUseCase.execute({
            ...args.input,
            createdBy: auth.userId,
          });
        }),
      updateKnowledgeBase: (
        _: unknown,
        args: { id: string; input: Parameters<UpdateKnowledgeBaseUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateKnowledgeBaseUseCase.execute(args.id, args.input);
        }),
      deleteKnowledgeBase: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.deleteKnowledgeBaseUseCase.execute(args.id);
        }),
      createKnowledgeDocItem: (
        _: unknown,
        args: { input: Parameters<CreateKnowledgeDocItemUseCase['execute']>[0] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.createKnowledgeDocItemUseCase.execute(args.input);
        }),
      updateKnowledgeDocItem: (
        _: unknown,
        args: { id: string; input: Parameters<UpdateKnowledgeDocItemUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateKnowledgeDocItemUseCase.execute(args.id, args.input);
        }),
      publishKnowledgeDocItem: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.publishKnowledgeDocItemUseCase.execute(args.id);
        }),
      updateKnowledgeDocItemIndex: (
        _: unknown,
        args: { itemId: string; indexedInSearch: boolean },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateKnowledgeDocItemIndexUseCase.execute(args.itemId, args.indexedInSearch);
        }),
      createKnowledgeDoc: (
        _: unknown,
        args: { input: Parameters<CreateKnowledgeDocUseCase['execute']>[0] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.createKnowledgeDocUseCase.execute({
            ...args.input,
            createdBy: auth.userId,
          });
        }),
      publishKnowledgeDoc: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.publishKnowledgeDocUseCase.execute(args.id);
        }),
      updateKnowledgeDoc: (
        _: unknown,
        args: { id: string; input: Parameters<UpdateKnowledgeDocUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateKnowledgeDocUseCase.execute(args.id, args.input);
        }),
      generateKnowledgeDocContent: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.generateKnowledgeDocContentUseCase.execute(args.id);
        }),
      enqueueDocGenerateJob: (
        _: unknown,
        args: { input: { itemId: string; title?: string; docType?: string } },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.enqueueDocGenerateJobUseCase.execute({
            ...args.input,
            createdBy: auth.userId,
          });
        }),
      cancelDocGenerateJob: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.cancelDocGenerateJobUseCase.execute(args.id);
        }),
      applyDocGenerateJob: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.applyDocGenerateJobUseCase.execute(args.id);
        }),
      generateTrainingDoc: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.generateTrainingDocUseCase.execute(args.repoId, auth.userId);
        }),
      createChatSession: (_: unknown, args: { title?: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAuth(ctx);
          return ctx.createChatSessionUseCase.execute(auth.userId, args.title);
        }),
      deleteChatSession: (_: unknown, args: { sessionId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAuth(ctx);
          return ctx.deleteChatSessionUseCase.execute(args.sessionId, auth.userId);
        }),
      addManagedArchitecture: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.addManagedArchitectureUseCase.execute(args.repoId);
        }),
      generateArchDraft: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.generateArchDraftUseCase.execute(args.repoId);
        }),
      enqueueArchGenerateJob: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.enqueueArchGenerateJobUseCase.execute({
            repoId: args.repoId,
            createdBy: auth.userId,
          });
        }),
      cancelArchGenerateJob: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.cancelArchGenerateJobUseCase.execute(args.id);
        }),
      publishOfficialArchitecture: (
        _: unknown,
        args: { repoId: string; versionNote: string },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.publishOfficialArchitectureUseCase.execute(args.repoId, args.versionNote);
        }),
      resolveArchDrift: (
        _: unknown,
        args: { id: string; status: string },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.resolveArchDriftUseCase.execute(args.id, args.status);
        }),
      createQaTemplate: (
        _: unknown,
        args: { input: Parameters<CreateQaTemplateUseCase['execute']>[0] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.createQaTemplateUseCase.execute({
            ...args.input,
            createdBy: auth.userId,
          });
        }),
      updateQaTemplate: (
        _: unknown,
        args: { id: string; input: Parameters<UpdateQaTemplateUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateQaTemplateUseCase.execute(args.id, args.input);
        }),
      deleteQaTemplate: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.deleteQaTemplateUseCase.execute(args.id);
        }),
      createAlertRule: (
        _: unknown,
        args: { input: Parameters<CreateAlertRuleUseCase['execute']>[0] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          const auth = requireAdmin(ctx);
          return ctx.createAlertRuleUseCase.execute({
            ...args.input,
            createdBy: auth.userId,
          });
        }),
      updateAlertRule: (
        _: unknown,
        args: { id: string; input: Parameters<UpdateAlertRuleUseCase['execute']>[1] },
        ctx: GraphQLContext,
      ) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.updateAlertRuleUseCase.execute(args.id, args.input);
        }),
      deleteAlertRule: (_: unknown, args: { id: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.deleteAlertRuleUseCase.execute(args.id);
        }),
    },
  };
}
