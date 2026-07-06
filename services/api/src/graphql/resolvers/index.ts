import type { LoginUseCase } from '../../application/auth/login.js';
import type { GetCurrentUserUseCase } from '../../application/auth/get-current-user.js';
import type { ListReposUseCase } from '../../application/repo/list-repos.js';
import type { ListKnowledgeDocsUseCase } from '../../application/knowledge/list-knowledge-docs.js';
import type { ListChatSessionsUseCase } from '../../application/chat/list-chat-sessions.js';
import type { ListIndexJobsUseCase } from '../../application/monitor/list-index-jobs.js';
import { ApplicationError } from '../../domain/errors.js';
import type { JwtPayload } from '../../infrastructure/auth/jwt.js';

export interface GraphQLContext {
  traceId: string;
  auth: JwtPayload | null;
  loginUseCase: LoginUseCase;
  getCurrentUserUseCase: GetCurrentUserUseCase;
  listReposUseCase: ListReposUseCase;
  listKnowledgeDocsUseCase: ListKnowledgeDocsUseCase;
  listChatSessionsUseCase: ListChatSessionsUseCase;
  listIndexJobsUseCase: ListIndexJobsUseCase;
}

function formatGraphQLError(error: unknown): Error {
  if (error instanceof ApplicationError) {
    return new Error(`${error.code}: ${error.message}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function createResolvers() {
  return {
    Query: {
      health: () => ({
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      }),
      me: async (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.getCurrentUserUseCase.execute(ctx.auth?.userId),
      repos: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listReposUseCase.execute(),
      knowledgeDocs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listKnowledgeDocsUseCase.execute(),
      chatSessions: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listChatSessionsUseCase.execute(),
      indexJobs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listIndexJobsUseCase.execute(),
    },
    Mutation: {
      _empty: () => null,
      login: async (
        _: unknown,
        args: { email: string; password: string },
        ctx: GraphQLContext,
      ) => {
        try {
          return await ctx.loginUseCase.execute(args);
        } catch (error) {
          throw formatGraphQLError(error);
        }
      },
      logout: () => true,
    },
  };
}
