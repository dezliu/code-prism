import type { ChatSSEPhase } from './use-chat-sse';

export const CHAT_PHASE_LABELS: Record<ChatSSEPhase, string> = {
  security: '安全检查中…',
  understanding: '理解问题中…',
  routing: '规划检索策略…',
  retrieving: '检索企业知识…',
  generating: '生成回答…',
  grounding: '校验回答依据…',
  formatting: '整理输出…',
};

export function formatChatStatusLabel(status: {
  phase: ChatSSEPhase;
  stepLabel?: string;
} | null): string {
  if (!status) {
    return '思考中…';
  }
  return status.stepLabel?.trim() || CHAT_PHASE_LABELS[status.phase] || '思考中…';
}
