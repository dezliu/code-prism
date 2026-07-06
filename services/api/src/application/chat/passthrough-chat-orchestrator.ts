import type { Response } from 'express';
import {
  pipeSseStream,
  StreamChatUseCase,
  writeSseEvent,
} from './stream-chat.js';
import type { StreamChatInput } from './stream-chat.js';

/** Test/dev orchestrator — skips DB persistence for SSE integration tests. */
export class PassthroughChatStreamOrchestrator {
  constructor(private readonly streamChat: StreamChatUseCase) {}

  async handle(input: {
    message: string;
    streamId: string;
    sessionId?: string;
    userId: string;
    res: Response;
  }): Promise<void> {
    const message = input.message.trim();
    if (!message) {
      writeSseEvent(input.res, {
        event: 'error',
        data: { code: 'VALIDATION_ERROR', message: 'message is required' },
      });
      return;
    }

    const streamInput: StreamChatInput = {
      message,
      streamId: input.streamId,
      sessionId: input.sessionId,
      userId: input.userId,
    };

    await pipeSseStream(input.res, this.streamChat.execute(streamInput));
  }
}
