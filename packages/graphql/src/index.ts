/** GraphQL client & codegen — Batch 3 auth + SSE hooks */
export { GRAPHQL_ENDPOINT, API_BASE_URL } from './constants';
export { createApolloClient, resetApolloClient } from './apollo-client';
export { LingPrismApolloProvider } from './apollo-provider';
export { loginWithCredentials, fetchCurrentUser, logout } from './auth-api';
export { useChatSSE } from './use-chat-sse';
export { resolveSymbols, resolveSymbolsStream } from './resolve-symbols';
export { CHAT_PHASE_LABELS, formatChatStatusLabel } from './chat-phase-labels';
export { useDocGenerateSSE } from './use-doc-generate-sse';
export { useArchGenerateSSE, ARCH_PHASE_LABELS } from './use-arch-generate-sse';
export {
  fetchDocGenerateJobs,
  fetchDocGenerateJob,
  enqueueDocGenerateJob,
  cancelDocGenerateJob,
  applyDocGenerateJob,
  useDocGenerateJobPoll,
} from './use-doc-generate-jobs';
export type { AuthUser, LoginResponse } from '@lingprism/shared';
export type {
  CodeLocation,
  ResolveSymbolsInput,
  SymbolStreamPhase,
  SymbolStreamStatus,
  ResolveSymbolsStreamCallbacks,
} from './resolve-symbols';
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
export type { DocGenerateJob, UseDocGenerateJobPollOptions } from './use-doc-generate-jobs';
export {
  fetchArchGenerateJobs,
  fetchArchGenerateJob,
  addManagedArchitecture,
  enqueueArchGenerateJob,
  cancelArchGenerateJob,
  useArchGenerateJobPoll,
} from './use-arch-generate-jobs';
export type {
  ArchGeneratePhase,
  UseArchGenerateSSEReturn,
} from './use-arch-generate-sse';
export type {
  ArchGenerateJob,
  AdminArchitectureItem,
  GraphData as ArchGraphData,
  UseArchGenerateJobPollOptions,
} from './use-arch-generate-jobs';
