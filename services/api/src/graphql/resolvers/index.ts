import type { ListReposUseCase } from '../../application/repo/list-repos.js';
import type { ListKnowledgeDocsUseCase } from '../../application/knowledge/list-knowledge-docs.js';
import type { ListChatSessionsUseCase } from '../../application/chat/list-chat-sessions.js';
import type { ListIndexJobsUseCase } from '../../application/monitor/list-index-jobs.js';

export interface GraphQLContext {
  traceId: string;
  listReposUseCase: ListReposUseCase;
  listKnowledgeDocsUseCase: ListKnowledgeDocsUseCase;
  listChatSessionsUseCase: ListChatSessionsUseCase;
  listIndexJobsUseCase: ListIndexJobsUseCase;
}

export function createResolvers() {
  return {
    Query: {
      health: () => ({
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
      }),
      repos: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listReposUseCase.execute(),
      knowledgeDocs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listKnowledgeDocsUseCase.execute(),
      chatSessions: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listChatSessionsUseCase.execute(),
      indexJobs: (_: unknown, __: unknown, ctx: GraphQLContext) =>
        ctx.listIndexJobsUseCase.execute(),
    },
  };
}
