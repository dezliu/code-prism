export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface ListChatSessionsUseCase {
  execute(): Promise<ChatSessionSummary[]>;
}

export class ListChatSessionsUseCaseStub implements ListChatSessionsUseCase {
  async execute(): Promise<ChatSessionSummary[]> {
    return [];
  }
}
