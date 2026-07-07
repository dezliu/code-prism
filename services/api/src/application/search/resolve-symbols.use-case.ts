import type { CoreHttpClient } from '../../infrastructure/clients/core-http.client.js';

export interface CodeLocationDto {
  repoId: string;
  repoName: string;
  repoUrl: string;
  filePath: string;
  language?: string;
  packageName?: string;
  className?: string;
  methodName: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  docComment?: string;
  qualifiedRef: string;
  snippet?: string;
  score?: number;
}

export interface ResolveSymbolsInput {
  query: string;
  className?: string;
  methodName?: string;
  repoIds?: string[];
  limit?: number;
}

export class ResolveSymbolsUseCase {
  constructor(private readonly core: CoreHttpClient) {}

  async execute(input: ResolveSymbolsInput): Promise<CodeLocationDto[]> {
    const result = await this.core.resolveSymbols({
      query: input.query,
      className: input.className,
      methodName: input.methodName,
      repoIds: input.repoIds,
      limit: input.limit,
    });
    return result.locations;
  }
}
