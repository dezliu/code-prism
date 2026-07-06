import { GraphQLScalarType } from 'graphql';
import type { LoginUseCase } from '../../application/auth/login.js';
import type { GetCurrentUserUseCase } from '../../application/auth/get-current-user.js';
import type { ListReposUseCase, CreateRepoUseCase, TestRepoConnectionUseCase, UpdateRepoMetadataUseCase, UpdateRepoUseCase } from '../../application/repo/repo.use-cases.js';
import type { ListKnowledgeDocsUseCase, CreateKnowledgeDocUseCase, PublishKnowledgeDocUseCase, GenerateTrainingDocUseCase } from '../../application/knowledge/knowledge.use-cases.js';
import type {
  ListChatSessionsUseCase,
  CreateChatSessionUseCase,
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
} from '../../application/architecture/architecture.use-cases.js';
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
  listKnowledgeDocsUseCase: ListKnowledgeDocsUseCase;
  createKnowledgeDocUseCase: CreateKnowledgeDocUseCase;
  publishKnowledgeDocUseCase: PublishKnowledgeDocUseCase;
  generateTrainingDocUseCase: GenerateTrainingDocUseCase;
  listChatSessionsUseCase: ListChatSessionsUseCase;
  createChatSessionUseCase: CreateChatSessionUseCase;
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
      knowledgeDocs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAuth(ctx);
          return ctx.listKnowledgeDocsUseCase.execute();
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
      generateArchDraft: (_: unknown, args: { repoId: string }, ctx: GraphQLContext) =>
        withHandler(() => {
          requireAdmin(ctx);
          return ctx.generateArchDraftUseCase.execute(args.repoId);
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
