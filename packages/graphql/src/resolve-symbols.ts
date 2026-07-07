import { getAuthToken } from '@lingprism/shared';
import { API_BASE_URL, GRAPHQL_ENDPOINT } from './constants';

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
  codeSnippet?: string; // 新增：实际代码片段（带行号）
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
        symbolKind startLine endLine docComment qualifiedRef snippet codeSnippet score
      }
    }`,
    { input },
  );
  return data.resolveSymbols;
}

/* ------------------------------------------------------------------ */
/*  SSE 流式符号解析                                                    */
/* ------------------------------------------------------------------ */

export type SymbolStreamPhase =
  | 'parsing'
  | 'searching_opensearch'
  | 'searching_qdrant'
  | 'merging'
  | 'extracting_snippets'
  | 'results'
  | 'done';

export interface SymbolStreamStatus {
  phase: SymbolStreamPhase;
  message: string;
}

export interface ResolveSymbolsStreamCallbacks {
  onStatus?: (status: SymbolStreamStatus) => void;
  onResults?: (locations: CodeLocation[]) => void;
  onDone?: (total: number) => void;
  onError?: (message: string) => void;
}

/**
 * 通过 SSE 流式解析符号，渐进式返回检索进度与结果。
 * 返回 AbortController 以便调用方取消。
 */
export function resolveSymbolsStream(
  input: ResolveSymbolsInput,
  callbacks: ResolveSymbolsStreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const token = getAuthToken();

  void (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/symbols/resolve-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`请求失败 (${response.status}): ${body}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('响应不支持流式读取');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventName = 'message';
          const dataLines: string[] = [];

          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (dataLines.length === 0) continue;

          try {
            const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;

            if (eventName === 'status') {
              callbacks.onStatus?.({
                phase: (data.phase as SymbolStreamPhase) ?? 'parsing',
                message: (data.message as string) ?? '',
              });
            } else if (eventName === 'results') {
              const locations = (data.locations as CodeLocation[]) ?? [];
              callbacks.onResults?.(locations);
            } else if (eventName === 'done') {
              callbacks.onDone?.(Number(data.total ?? 0));
            } else if (eventName === 'error') {
              callbacks.onError?.(String(data.error ?? '未知错误'));
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }

      // 处理 buffer 中残留的数据
      if (buffer.trim()) {
        const blocks = `${buffer}\n\n`.split('\n\n');
        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventName = 'message';
          const dataLines: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length === 0) continue;
          try {
            const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
            if (eventName === 'results') callbacks.onResults?.((data.locations as CodeLocation[]) ?? []);
            else if (eventName === 'done') callbacks.onDone?.(Number(data.total ?? 0));
            else if (eventName === 'error') callbacks.onError?.(String(data.error ?? '未知错误'));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    }
  })();

  return controller;
}
