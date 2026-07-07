'use client';

import { useCallback, useRef, useState } from 'react';
import { API_BASE_URL } from './constants';
import { getAuthToken } from '@lingprism/shared';
import { CHAT_PHASE_LABELS } from './chat-phase-labels';
import type { CodeLocation } from './resolve-symbols';

export type { CodeLocation };

export type ChatSSEPhase =
  | 'security'
  | 'understanding'
  | 'routing'
  | 'retrieving'
  | 'generating'
  | 'grounding'
  | 'formatting';

export interface ChatSSEStatus {
  phase: ChatSSEPhase;
  streamId?: string;
  stepLabel?: string;
}

export interface ChatSSEEvent {
  type: 'status' | 'token' | 'source' | 'template_hint' | 'done' | 'error';
  data: Record<string, unknown>;
}

export interface ChatSource {
  type: string;
  title: string;
  ref?: string;
}

export interface ChatTemplateHint {
  templateId: string;
  name: string;
  preview: string;
}

export interface ChatSessionInfo {
  id: string;
  title: string;
}

export interface UseChatSSEReturn {
  content: string;
  status: ChatSSEStatus | null;
  streaming: boolean;
  error: string | null;
  interrupted: boolean;
  sources: ChatSource[];
  codeLocations: CodeLocation[];
  templateHints: ChatTemplateHint[];
  sessionInfo: ChatSessionInfo | null;
  send: (message: string, sessionId?: string) => Promise<void>;
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

export function useChatSSE(): UseChatSSEReturn {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<ChatSSEStatus | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [codeLocations, setCodeLocations] = useState<CodeLocation[]>([]);
  const [templateHints, setTemplateHints] = useState<ChatTemplateHint[]>([]);
  const [sessionInfo, setSessionInfo] = useState<ChatSessionInfo | null>(null);

  const streamIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setContent('');
    setStatus(null);
    setError(null);
    setInterrupted(false);
    setSources([]);
    setCodeLocations([]);
    setTemplateHints([]);
    setSessionInfo(null);
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
      // stop is best-effort
    }
  }, []);

  const send = useCallback(
    async (message: string, sessionId?: string) => {
      const token = getAuthToken();
      if (!token) {
        setError('请先登录');
        return;
      }

      reset();
      setStreaming(true);
      setStatus({ phase: 'understanding', stepLabel: '正在准备…' });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message, sessionId }),
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
              const phase = data.phase as ChatSSEPhase;
              const streamId = data.streamId as string | undefined;
              if (streamId) {
                streamIdRef.current = streamId;
              }
              setStatus((prev) => ({
                phase,
                streamId: streamId ?? streamIdRef.current ?? undefined,
                stepLabel: CHAT_PHASE_LABELS[phase] ?? prev?.stepLabel,
              }));
            } else if (event === 'step') {
              const label = String(data.label ?? '');
              setStatus((prev) => ({
                phase: prev?.phase ?? 'understanding',
                streamId: prev?.streamId,
                stepLabel: label || prev?.stepLabel,
              }));
            } else if (event === 'session') {
              const id = String(data.sessionId ?? '');
              const title = String(data.title ?? '');
              if (id) {
                setSessionInfo({ id, title });
              }
            } else if (event === 'token') {
              const text = String(data.text ?? '');
              setContent((prev) => prev + text);
            } else if (event === 'code_location') {
              setCodeLocations((prev) => [
                ...prev,
                {
                  repoId: String(data.repoId ?? ''),
                  repoName: String(data.repoName ?? ''),
                  repoUrl: String(data.repoUrl ?? ''),
                  filePath: String(data.filePath ?? ''),
                  language: data.language ? String(data.language) : undefined,
                  packageName: data.packageName ? String(data.packageName) : undefined,
                  className: data.className ? String(data.className) : undefined,
                  methodName: String(data.methodName ?? data.symbol ?? ''),
                  symbolKind: data.symbolKind ? String(data.symbolKind) : undefined,
                  startLine: Number(data.startLine ?? 0),
                  endLine: Number(data.endLine ?? 0),
                  docComment: data.docComment ? String(data.docComment) : undefined,
                  qualifiedRef: String(data.qualifiedRef ?? ''),
                  snippet: data.snippet ? String(data.snippet) : undefined,
                  score: data.score != null ? Number(data.score) : undefined,
                },
              ]);
            } else if (event === 'source') {
              setSources((prev) => [
                ...prev,
                {
                  type: String(data.type ?? 'doc'),
                  title: String(data.title ?? ''),
                  ref: data.ref ? String(data.ref) : undefined,
                },
              ]);
            } else if (event === 'template_hint') {
              setTemplateHints((prev) => [
                ...prev,
                {
                  templateId: String(data.templateId ?? ''),
                  name: String(data.name ?? ''),
                  preview: String(data.preview ?? ''),
                },
              ]);
            } else if (event === 'done') {
              setInterrupted(Boolean(data.interrupted));
              setStreaming(false);
            } else if (event === 'error') {
              setError(String(data.message ?? '生成失败'));
              setStreaming(false);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setInterrupted(true);
        } else {
          setError(err instanceof Error ? err.message : '发送失败');
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [reset],
  );

  return {
    content,
    status,
    streaming,
    error,
    interrupted,
    sources,
    codeLocations,
    templateHints,
    sessionInfo,
    send,
    stop,
    reset,
  };
}
