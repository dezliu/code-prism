export interface IndexJobSummary {
  id: string;
  repoId: string;
  status: string;
}

export interface ListIndexJobsUseCase {
  execute(): Promise<IndexJobSummary[]>;
}

export class ListIndexJobsUseCaseStub implements ListIndexJobsUseCase {
  async execute(): Promise<IndexJobSummary[]> {
    return [];
  }
}
