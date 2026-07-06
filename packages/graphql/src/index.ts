/** GraphQL client & codegen — Batch 3 auth + SSE hooks */
export { GRAPHQL_ENDPOINT, API_BASE_URL } from './constants';
export { createApolloClient, resetApolloClient } from './apollo-client';
export { LingPrismApolloProvider } from './apollo-provider';
export { loginWithCredentials, fetchCurrentUser, logout } from './auth-api';
export { useChatSSE } from './use-chat-sse';
export { useDocGenerateSSE } from './use-doc-generate-sse';
export type { AuthUser, LoginResponse } from '@lingprism/shared';
export type {
  ChatSSEEvent,
  ChatSSEPhase,
  ChatSSEStatus,
  ChatSessionInfo,
  ChatSource,
  UseChatSSEReturn,
} from './use-chat-sse';
export type {
  DocGeneratePhase,
  DocGenerateStatus,
  UseDocGenerateSSEReturn,
} from './use-doc-generate-sse';
