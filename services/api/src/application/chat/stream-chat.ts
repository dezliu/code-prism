import type { Response } from 'express';
import type { ApiConfig } from '../../config.js';
import type {
  AiWorkerStreamClient,
  ChatStreamRequest,
  SseEvent,
} from '../../infrastructure/clients/ai-worker.client.js';
import type { StreamCancelStore } from '../../infrastructure/clients/stream-cancel.store.js';

export interface StreamChatInput {
  message: string;
  streamId: string;
  sessionId?: string;
  userId: string;
  sessionContext?: ChatStreamRequest['sessionContext'];
}

export class StreamChatUseCase {
  constructor(
    private readonly aiWorker: AiWorkerStreamClient,
    private readonly cancelStore: StreamCancelStore,
  ) {}

  async *execute(input: StreamChatInput): AsyncGenerator<SseEvent, void, unknown> {
    const message = input.message.trim();
    if (!message) {
      yield {
        event: 'error',
        data: { code: 'VALIDATION_ERROR', message: 'message is required' },
      };
      return;
    }

    for await (const event of this.aiWorker.streamChat({
      message,
      streamId: input.streamId,
      sessionId: input.sessionId,
      userId: input.userId,
      sessionContext: input.sessionContext,
    })) {
      if (await this.cancelStore.isCancelled(input.streamId)) {
        yield {
          event: 'done',
          data: {
            messageId: `msg_${input.streamId.slice(0, 8)}`,
            interrupted: true,
          },
        };
        return;
      }
      yield event;
    }
  }
}

export function writeSseEvent(res: Response, event: SseEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

export async function pipeSseStream(
  res: Response,
  events: AsyncGenerator<SseEvent, void, unknown>,
): Promise<void> {
  for await (const event of events) {
    writeSseEvent(res, event);
    if (event.event === 'done' || event.event === 'error') {
      break;
    }
  }
}
