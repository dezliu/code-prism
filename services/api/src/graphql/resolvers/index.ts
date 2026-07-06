import { GraphQLScalarType } from 'graphql';
import type { LoginUseCase } from '../../application/auth/login.js';
import type { GetCurrentUserUseCase } from '../../application/auth/get-current-user.js';
import type { ListReposUseCase, CreateRepoUseCase, TestRepoConnectionUseCase, UpdateRepoMetadataUseCase } from '../../application/repo/repo.use-cases.js';
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
  GetOfficialArchitectureUseCase,
  ListOfficialArchitecturesUseCase,
} from '../../application/monitor/monitor.use-cases.js';
import type {
  GetArchitectureForBrowseUseCase,
  GetArchitectureDraftUseCase,
  GenerateArchDraftUseCase,
  PublishOfficialArchitectureUseCase,
} from '../../application/architecture/architecture.use-cases.js';
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
  getOfficialArchitectureUseCase: GetOfficialArchitectureUseCase;
  listOfficialArchitecturesUseCase: ListOfficialArchitecturesUseCase;
  getArchitectureForBrowseUseCase: GetArchitectureForBrowseUseCase;
  getArchitectureDraftUseCase: GetArchitectureDraftUseCase;
  generateArchDraftUseCase: GenerateArchDraftUseCase;
  publishOfficialArchitectureUseCase: PublishOfficialArchitectureUseCase;
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
    },
  };
}
