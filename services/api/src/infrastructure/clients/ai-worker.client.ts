import type { ApiConfig } from '../../config.js';

export interface ChatStreamRequest {
  message: string;
  streamId: string;
  sessionId?: string;
  userId: string;
  sessionContext?: {
    anchor?: Record<string, unknown> | null;
    recentMessages?: Array<{ role: string; content: string }>;
  };
}

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface AiWorkerStreamClient {
  streamChat(request: ChatStreamRequest): AsyncGenerator<SseEvent, void, unknown>;
}

/**
 * HTTP client — proxies SSE events from ai-worker internal chat endpoint.
 */
export class AiWorkerHttpStreamClient implements AiWorkerStreamClient {
  constructor(private readonly config: ApiConfig) {}

  async *streamChat(request: ChatStreamRequest): AsyncGenerator<SseEvent, void, unknown> {
    const url = `${this.config.aiWorkerUrl.replace(/\/$/, '')}/internal/chat/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: request.message,
        streamId: request.streamId,
        sessionId: request.sessionId,
        userId: request.userId,
        sessionContext: request.sessionContext,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ai-worker stream failed (${response.status}): ${body}`);
    }

    if (!response.body) {
      throw new Error('ai-worker stream returned empty body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = parseSseBuffer(buffer);
      buffer = events.remainder;

      for (const event of events.parsed) {
        yield event;
      }
    }

    if (buffer.trim()) {
      const events = parseSseBuffer(`${buffer}\n\n`);
      for (const event of events.parsed) {
        yield event;
      }
    }
  }
}

export function parseSseBuffer(buffer: string): {
  parsed: SseEvent[];
  remainder: string;
} {
  const parsed: SseEvent[] = [];
  const blocks = buffer.split('\n\n');

  const remainder = blocks.pop() ?? '';
  for (const block of blocks) {
    const event = parseSseBlock(block);
    if (event) {
      parsed.push(event);
    }
  }

  return { parsed, remainder };
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
    return { event: eventName, data };
  } catch {
    return null;
  }
}

/** In-process mock for unit tests — simulates token streaming without ai-worker. */
export class MockAiWorkerStreamClient implements AiWorkerStreamClient {
  constructor(private readonly tokens: string[] = ['你好', '，', '这是', '测试', '回答']) {}

  async *streamChat(request: ChatStreamRequest): AsyncGenerator<SseEvent, void, unknown> {
    yield { event: 'status', data: { phase: 'understanding' } };
    yield { event: 'status', data: { phase: 'generating' } };

    for (const text of this.tokens) {
      yield { event: 'token', data: { text } };
    }

    yield {
      event: 'done',
      data: {
        messageId: `msg_${request.streamId.slice(0, 8)}`,
        interrupted: false,
      },
    };
  }
}
