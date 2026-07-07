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

export default function CodeSearchPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [mode, setMode] = useState<SearchMode>('semantic');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CodeLocation[]>([]);
  const [references, setReferences] = useState<KnowledgeRef[]>([]);
  const [streamStatus, setStreamStatus] = useState<SymbolStreamStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const handleSearch = async () => {
    const text = query.trim();
    if (!text) return;

    // 取消上一次检索
    abortRef.current?.abort();

    setLoading(true);
    setError(null);
    setResults([]);
    setReferences([]);
    setStreamStatus(null);

    let className: string | undefined;
    let methodName: string | undefined;

    if (mode === 'symbol') {
      // 符号模式：解析 Class.method 格式
      const dot = text.match(/^([A-Z][A-Za-z0-9_]*)\.([A-Za-z_]\w*)$/);
      if (dot) {
        className = dot[1];
        methodName = dot[2];
      } else {
        methodName = text;
      }
    } else {
      // 语义模式：尝试从自然语言中提取类名/方法名
      const classMatch = text.match(/\b([A-Z][A-Za-z0-9_]{3,})\b/);
      const methodKeywords = ['rollback', 'save', 'delete', 'update', 'query', 'get', 'set', 'init', 'destroy', 'handle', 'process', 'validate'];
      const methodMatch = text.match(new RegExp(`\\b(${methodKeywords.join('|')})\\b`, 'i'));
      if (classMatch) className = classMatch[1];
      if (methodMatch) methodName = methodMatch[1].toLowerCase();
    }

    const controller = resolveSymbolsStream(
      { query: text, className, methodName, limit: 8 },
      {
        onStatus: (status) => setStreamStatus(status),
        onResults: (locations) => setResults(locations),
        onReferences: (refs) => setReferences(refs),
        onDone: () => {
          setLoading(false);
          setStreamStatus(null);
        },
        onError: (msg) => {
          setError(msg);
          setResults([]);
          setLoading(false);
          setStreamStatus(null);
        },
      },
    );
    abortRef.current = controller;
  };

  if (checkingAuth || !user) {
    return <div className="user-loading">加载中…</div>;
  }

  return (
    <UserShell user={user}>
      <div className="user-code-search-page">
        <header className="user-code-search-header">
          <h1>代码检索</h1>
          <p>语义描述或符号名（如 OrderService.rollback）定位企业代码位置</p>
        </header>

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

        <div className="user-code-search-input">
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

        {error ? <div className="user-error-text">{error}</div> : null}

        {streamStatus ? (
          <div className="user-code-search-status">
            <span className="user-status-dot" />
            <span>{streamStatus.message}</span>
            {streamStatus.phase === 'llm_rewrite' ? (
              <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>AI 正在优化查询…</span>
            ) : null}
          </div>
        ) : null}

        <div className="user-code-search-results">
          {results.length === 0 && !loading ? (
            <p className="user-code-search-empty">输入查询条件开始检索</p>
          ) : null}
          {results.map((loc) => (
            <CodeLocationCard
              key={`${loc.repoId}-${loc.qualifiedRef}-${loc.startLine}`}
              location={loc}
              title={`${loc.className || loc.methodName} 相关代码`}
            />
          ))}
        </div>

        {/* 知识文档参考链接 */}
        {references.length > 0 ? (
          <div className="user-code-search-refs">
            <div className="user-code-search-refs__title">相关文档</div>
            {references.map((ref) => (
              <a
                key={ref.docId}
                className="user-code-search-refs__item"
                href={`/knowledge?docId=${encodeURIComponent(ref.docId)}`}
                target="_blank"
                rel="noreferrer"
              >
                <span className="user-code-search-refs__name">{ref.title}</span>
                <span className="user-code-search-refs__snippet">{ref.snippet}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </UserShell>
  );
}
