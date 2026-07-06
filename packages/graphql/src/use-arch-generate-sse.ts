'use client';

import { useCallback, useRef, useState } from 'react';
import { API_BASE_URL } from './constants';
import { getAuthToken } from '@lingprism/shared';
import type { GraphData } from './use-arch-generate-jobs';

export type ArchGeneratePhase =
  | 'fetching_code'
  | 'analyzing'
  | 'generating'
  | 'validating'
  | 'repairing';

export interface ArchGenerateStatus {
  phase: ArchGeneratePhase;
  streamId?: string;
  attempt?: number;
}

export interface UseArchGenerateSSEReturn {
  status: ArchGenerateStatus | null;
  streaming: boolean;
  error: string | null;
  graphData: GraphData | null;
  generate: (repoId: string) => Promise<GraphData | null>;
  stop: () => Promise<void>;
  reset: () => void;
}

function parseSseChunk(buffer: string): {
  events: Array<{ event: string; data: string }>;
  remainder: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, remainder };
}

export function useArchGenerateSSE(): UseArchGenerateSSEReturn {
  const [status, setStatus] = useState<ArchGenerateStatus | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setStatus(null);
    setError(null);
    setGraphData(null);
    streamIdRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    const streamId = streamIdRef.current;
    abortRef.current?.abort();

    if (!streamId) {
      return;
    }

    const token = getAuthToken();
    try {
      await fetch(`${API_BASE_URL}/api/chat/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ streamId }),
      });
    } catch {
      // best-effort
    }
  }, []);

  const generate = useCallback(
    async (repoId: string): Promise<GraphData | null> => {
      const token = getAuthToken();
      if (!token) {
        setError('请先登录');
        return null;
      }

      reset();
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE_URL}/api/architecture/generate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ repoId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            (body as { message?: string }).message ?? `请求失败 (${response.status})`,
          );
        }

        const headerStreamId = response.headers.get('X-Stream-Id');
        if (headerStreamId) {
          streamIdRef.current = headerStreamId;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('响应不支持流式读取');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let result: GraphData | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseChunk(buffer);
          buffer = parsed.remainder;

          for (const { event, data: rawData } of parsed.events) {
            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(rawData) as Record<string, unknown>;
            } catch {
              continue;
            }

            if (event === 'status') {
              const phase = data.phase as ArchGeneratePhase;
              const streamId = data.streamId as string | undefined;
              const attempt = data.attempt as number | undefined;
              if (streamId) {
                streamIdRef.current = streamId;
              }
              setStatus({
                phase,
                streamId: streamId ?? streamIdRef.current ?? undefined,
                attempt,
              });
            } else if (event === 'done') {
              if (!data.interrupted) {
                result = data.graphData as GraphData;
                setGraphData(result);
              }
              setStreaming(false);
            } else if (event === 'error') {
              setError(String(data.message ?? '生成失败'));
              setStreaming(false);
              return null;
            }
          }
        }

        return result;
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : '生成失败');
        }
        return null;
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [reset],
  );

  return {
    status,
    streaming,
    error,
    graphData,
    generate,
    stop,
    reset,
  };
}

export const ARCH_PHASE_LABELS: Record<ArchGeneratePhase, string> = {
  fetching_code: '正在同步代码…',
  analyzing: '正在分析系统结构…',
  generating: '正在生成架构图…',
  validating: '正在校验架构数据…',
  repairing: '正在修正格式错误…',
};
