export interface KnowledgeDocSummary {
  id: string;
  title: string;
  status: string;
}

export interface ListKnowledgeDocsUseCase {
  execute(): Promise<KnowledgeDocSummary[]>;
}

export class ListKnowledgeDocsUseCaseStub implements ListKnowledgeDocsUseCase {
  async execute(): Promise<KnowledgeDocSummary[]> {
    return [];
  }
}
