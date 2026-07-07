import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';

export interface CodeLocation {
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

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GraphQL request failed');
  }
  if (!payload.data) {
    throw new Error('GraphQL response missing data');
  }
  return payload.data;
}

export async function resolveSymbols(input: ResolveSymbolsInput): Promise<CodeLocation[]> {
  const data = await graphqlRequest<{ resolveSymbols: CodeLocation[] }>(
    `query($input: ResolveSymbolsInput!) {
      resolveSymbols(input: $input) {
        repoId repoName repoUrl filePath language packageName className methodName
        symbolKind startLine endLine docComment qualifiedRef snippet score
      }
    }`,
    { input },
  );
  return data.resolveSymbols;
}
