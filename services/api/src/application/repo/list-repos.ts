export interface RepoSummary {
  id: string;
  name: string;
  url: string;
  indexStatus: string | null;
}

export interface ListReposUseCase {
  execute(): Promise<RepoSummary[]>;
}

export class ListReposUseCaseStub implements ListReposUseCase {
  async execute(): Promise<RepoSummary[]> {
    return [];
  }
}
