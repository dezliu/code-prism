'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchCurrentUser,
  resolveSymbolsStream,
  type CodeLocation,
  type KnowledgeRef,
  type SymbolStreamStatus,
} from '@lingprism/graphql';
import type { AuthUser } from '@lingprism/shared';
import { UserShell } from '../../components/UserShell';
import { CodeLocationCard } from '../../components/CodeLocationCard';

type SearchMode = 'semantic' | 'symbol';

interface SearchTurn {
  id: string;
  query: string;
  results: CodeLocation[];
  references: KnowledgeRef[];
  error: string | null;
  loading: boolean;
  streamStatus: SymbolStreamStatus | null;
}

export default function CodeSearchPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [mode, setMode] = useState<SearchMode>('semantic');
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<SearchTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setCheckingAuth(false));
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const updateTurn = (turnId: string, patch: Partial<SearchTurn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)));
  };

  const handleSearch = async () => {
    const text = query.trim();
    if (!text) return;

    abortRef.current?.abort();

    const turnId = crypto.randomUUID();
    setTurns((prev) => [
      ...prev,
      {
        id: turnId,
        query: text,
        results: [],
        references: [],
        error: null,
        loading: true,
        streamStatus: null,
      },
    ]);
    setQuery('');

    let className: string | undefined;
    let methodName: string | undefined;

    if (mode === 'symbol') {
      const dot = text.match(/^([A-Z][A-Za-z0-9_]*)\.([A-Za-z_]\w*)$/);
      if (dot) {
        className = dot[1];
        methodName = dot[2];
      } else {
        methodName = text;
      }
    } else {
      const classMatch = text.match(/\b([A-Z][A-Za-z0-9_]{3,})\b/);
      const methodKeywords = ['rollback', 'save', 'delete', 'update', 'query', 'get', 'set', 'init', 'destroy', 'handle', 'process', 'validate'];
      const methodMatch = text.match(new RegExp(`\\b(${methodKeywords.join('|')})\\b`, 'i'));
      if (classMatch) className = classMatch[1];
      if (methodMatch) methodName = methodMatch[1].toLowerCase();
    }

    const controller = resolveSymbolsStream(
      { query: text, className, methodName, limit: 8 },
      {
        onStatus: (status) => updateTurn(turnId, { streamStatus: status }),
        onResults: (locations) => updateTurn(turnId, { results: locations }),
        onReferences: (refs) => updateTurn(turnId, { references: refs }),
        onDone: () => updateTurn(turnId, { loading: false, streamStatus: null }),
        onError: (msg) => {
          updateTurn(turnId, {
            error: msg,
            results: [],
            loading: false,
            streamStatus: null,
          });
        },
      },
    );
    abortRef.current = controller;
  };

  const loading = turns.some((turn) => turn.loading);

  if (checkingAuth || !user) {
    return <div className="user-loading">加载中…</div>;
  }

  return (
    <UserShell user={user}>
      <div className="user-chat-view">
        <div className="user-chat-toolbar user-code-search-toolbar">
          <div className="user-code-search-tabs">
            <button
              type="button"
              className={mode === 'semantic' ? 'active' : undefined}
              onClick={() => setMode('semantic')}
            >
              语义检索
            </button>
            <button
              type="button"
              className={mode === 'symbol' ? 'active' : undefined}
              onClick={() => setMode('symbol')}
            >
              符号检索
            </button>
          </div>
          <div className="user-code-search-toolbar__links">
            <a href="/">智能问答</a>
            <a href="/architecture">架构图</a>
            <a href="/docs">文档中心</a>
          </div>
        </div>

        <div className="user-chat-messages">
          {turns.length === 0 ? (
            <div className="user-msg assistant">
              <span className="user-msg-label">灵镜</span>
              <div className="user-msg-bubble">
                输入查询条件开始检索。支持语义描述（如「订单状态回滚的代码在哪」）或符号名（如 OrderService.rollback）。
              </div>
            </div>
          ) : null}

          {turns.map((turn) => (
            <div key={turn.id}>
              <div className="user-msg user">
                <span className="user-msg-label">我</span>
                <div className="user-msg-bubble">{turn.query}</div>
              </div>

              <div className="user-msg assistant">
                <span className="user-msg-label">灵镜</span>
                <div className="user-msg-bubble">
                  {turn.loading && turn.results.length === 0 && !turn.error ? (
                    <div className="user-thinking">
                      <span className="user-status-dot" />
                      <span className="user-thinking-label">
                        {turn.streamStatus?.message ?? '正在检索代码…'}
                      </span>
                      {turn.streamStatus?.phase === 'llm_rewrite' ? (
                        <span className="user-thinking-meta">AI 正在优化查询…</span>
                      ) : null}
                    </div>
                  ) : null}

                  {turn.error ? <div className="user-error-text">{turn.error}</div> : null}

                  {!turn.loading && !turn.error && turn.results.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--user-text-muted)' }}>未找到匹配的代码位置，请尝试调整查询条件。</p>
                  ) : null}

                  {turn.results.length > 0 ? (
                    <div className="user-code-location-list">
                      {turn.results.map((loc) => (
                        <CodeLocationCard
                          key={`${turn.id}-${loc.repoId}-${loc.qualifiedRef}-${loc.startLine}`}
                          location={loc}
                          title={`${loc.className || loc.methodName} 相关代码`}
                        />
                      ))}
                    </div>
                  ) : null}

                  {turn.references.length > 0 ? (
                    <div className="user-code-search-refs">
                      <div className="user-code-search-refs__title">相关文档</div>
                      {turn.references.map((ref) => (
                        <a
                          key={ref.docId}
                          className="user-code-search-refs__item"
                          href={`/docs/${encodeURIComponent(ref.docId)}`}
                        >
                          <span className="user-code-search-refs__name">{ref.title}</span>
                          <span className="user-code-search-refs__snippet">{ref.snippet}</span>
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {turn.loading && turn.results.length > 0 && turn.streamStatus ? (
                    <div className="user-stream-status">
                      <span className="user-status-dot" />
                      {turn.streamStatus.message}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        <div className="user-chat-input-area">
          <div className="user-input-wrap">
            <textarea
              rows={1}
              value={query}
              placeholder={
                mode === 'symbol'
                  ? '输入 Class.method 或方法名，如 OrderService.rollback'
                  : '描述你要找的功能，如：订单状态回滚的代码在哪'
              }
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              disabled={loading}
            />
            <button
              type="button"
              className="user-send-btn"
              title="检索"
              disabled={loading || !query.trim()}
              onClick={() => void handleSearch()}
            >
              ↑
            </button>
          </div>
          <p className="user-input-hint">Enter 检索 · Shift+Enter 换行</p>
        </div>
      </div>
    </UserShell>
  );
}
