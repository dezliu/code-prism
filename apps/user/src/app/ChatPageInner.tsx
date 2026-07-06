'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchCurrentUser,
  logout,
  useChatSSE,
  type AuthUser,
  type ChatSource,
} from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { UserShell } from '../components/UserShell';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  interrupted?: boolean;
}

const RECOMMENDATIONS = [
  { tag: 'ADR', title: '支付服务幂等性设计 ADR-003', meta: 'payment-service · 更新于 7月4日' },
  { tag: '培训文档', title: '订单平台新人 onboarding 指南', meta: 'order-platform · 更新于 7月2日' },
  { tag: '架构图', title: '支付中台 2026-Q2 官方架构', meta: '12 个服务节点 · 已发布' },
  { tag: '运维手册', title: '用户中心部署与故障排查', meta: 'user-center · 更新于 6月28日' },
];

async function fetchSessions(): Promise<ChatSession[]> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query: 'query { chatSessions { id title updatedAt } }' }),
  });
  const json = await res.json();
  if (json.errors?.length) return [];
  return json.data.chatSessions;
}

async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      query: `
        query($sessionId: ID!) {
          chatMessages(sessionId: $sessionId) {
            id role content sources { type title ref } interrupted
          }
        }
      `,
      variables: { sessionId },
    }),
  });
  const json = await res.json();
  if (json.errors?.length) return [];
  return (json.data.chatMessages as Array<{
    id: string;
    role: string;
    content: string;
    sources: ChatSource[] | null;
    interrupted: boolean;
  }>).map((msg) => ({
    id: msg.id,
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
    sources: msg.sources ?? undefined,
    interrupted: msg.interrupted,
  }));
}

async function deleteSession(id: string): Promise<void> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      query: 'mutation($sessionId: ID!) { deleteChatSession(sessionId: $sessionId) }',
      variables: { sessionId: id },
    }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
}

function groupSessionsByDate(sessions: ChatSession[]): Array<{ label: string; items: ChatSession[] }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups: Record<string, ChatSession[]> = {};
  for (const session of sessions) {
    const date = new Date(session.updatedAt);
    date.setHours(0, 0, 0, 0);
    let label = '更早';
    if (date.getTime() === today.getTime()) label = '今天';
    else if (date.getTime() === yesterday.getTime()) label = '昨天';
    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
  }

  const order = ['今天', '昨天', '更早'];
  return order.filter((l) => groups[l]?.length).map((label) => ({ label, items: groups[label] }));
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? undefined;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showChat, setShowChat] = useState(!!sessionId);
  const chat = useChatSSE();
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const list = await fetchSessions();
        setSessions(list);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setCheckingAuth(false));
  }, [router]);

  useEffect(() => {
    if (sessionId) setShowChat(true);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      chat.reset();
      return;
    }

    // Only load history when navigating to a session — not when streaming ends
    // (chat.reset() clears content and would otherwise refetch and overwrite the
    // assistant message before the server persist completes).
    if (chat.streaming) {
      return;
    }

    let cancelled = false;
    setLoadingMessages(true);
    fetchMessages(sessionId)
      .then((list) => {
        if (!cancelled) {
          setMessages(list);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload history only on session change
  }, [sessionId]);

  useEffect(() => {
    if (!chat.sessionInfo) return;

    const { id, title } = chat.sessionInfo;
    if (id !== sessionId) {
      router.replace(`/?sessionId=${id}`);
    }

    setSessions((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const updatedAt = new Date().toISOString();
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], title, updatedAt };
        return next;
      }
      return [{ id, title, updatedAt }, ...prev];
    });
  }, [chat.sessionInfo, sessionId, router]);

  useEffect(() => {
    if (chat.streaming) {
      wasStreamingRef.current = true;
      return;
    }

    if (!wasStreamingRef.current) {
      return;
    }
    wasStreamingRef.current = false;

    if (chat.content) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: chat.content,
          sources: chat.sources.length > 0 ? [...chat.sources] : undefined,
          interrupted: chat.interrupted,
        },
      ]);
    } else if (chat.error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: chat.error,
        },
      ]);
    }
    chat.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finalize one streaming turn
  }, [chat.streaming, chat.content, chat.sources, chat.interrupted, chat.error]);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || chat.streaming) {
      return;
    }
    setInput('');
    setShowChat(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
      },
    ]);
    await chat.send(message, sessionId);
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleNewChat = () => {
    chat.reset();
    setMessages([]);
    setShowChat(true);
    router.push('/');
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('确定删除此会话？删除后无法恢复。')) {
      return;
    }
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        chat.reset();
        setMessages([]);
        setShowChat(false);
        router.push('/');
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (checkingAuth) {
    return null;
  }

  const sessionGroups = groupSessionsByDate(sessions);
  const inChat = showChat || !!chat.content || chat.streaming;

  const sidebar = (
    <aside className={`user-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <button type="button" className="user-new-chat-btn" onClick={handleNewChat}>
        + 新对话
      </button>
      <div className="user-sidebar-header">
        <span className="user-sidebar-title">历史会话</span>
        <button
          type="button"
          className="user-collapse-btn"
          title="折叠"
          onClick={() => setSidebarCollapsed(true)}
        >
          ◀
        </button>
      </div>
      <div className="user-session-group">
        {sessionGroups.length === 0 ? (
          <div className="user-session-date">暂无会话</div>
        ) : (
          sessionGroups.map((group) => (
            <div key={group.label}>
              <div className="user-session-date">{group.label}</div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className={`user-session-item${sessionId === item.id ? ' active' : ''}`}
                >
                  <a
                    href={`/?sessionId=${item.id}`}
                    className="user-session-link"
                    onClick={() => setShowChat(true)}
                  >
                    <span className="user-session-icon">💬</span>
                    <div className="user-session-text">
                      <div className="user-session-name">{item.title}</div>
                      <div className="user-session-time">{formatSessionTime(item.updatedAt)}</div>
                    </div>
                  </a>
                  <button
                    type="button"
                    className="user-session-delete"
                    title="删除会话"
                    aria-label="删除会话"
                    onClick={(e) => handleDeleteSession(item.id, e)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );

  return (
    <UserShell user={user} sidebar={sidebar}>
      {sidebarCollapsed ? (
        <button
          type="button"
          className="user-collapse-btn"
          style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, background: '#fff', border: '1px solid #ffedd5', padding: '6px 10px' }}
          onClick={() => setSidebarCollapsed(false)}
        >
          ▶ 历史会话
        </button>
      ) : null}

      {!inChat ? (
        <div className="user-home-view">
          <h1 className="user-home-greeting">你好，有什么想了解的项目知识？</h1>
          <p className="user-home-sub">用自然语言提问，灵镜会帮你找到架构、代码与文档中的答案。</p>

          <div className="user-quick-grid">
            <button type="button" className="user-quick-card" onClick={() => setShowChat(true)} style={{ textAlign: 'left' }}>
              <div className="user-quick-icon">💡</div>
              <div className="user-quick-title">智能问答</div>
              <div className="user-quick-desc">自然语言提问，获取项目架构、代码逻辑与文档知识</div>
            </button>
            <a href="/architecture" className="user-quick-card">
              <div className="user-quick-icon">◇</div>
              <div className="user-quick-title">架构图浏览</div>
              <div className="user-quick-desc">查看官方发布的系统架构图，交互探索服务节点</div>
            </a>
            <button type="button" className="user-quick-card" onClick={() => setShowChat(true)} style={{ textAlign: 'left' }}>
              <div className="user-quick-icon">⌕</div>
              <div className="user-quick-title">代码检索</div>
              <div className="user-quick-desc">语义或符号检索，定位函数定义与调用关系</div>
            </button>
          </div>

          <div className="user-rec-section">
            <h3>推荐知识</h3>
            <div className="user-rec-cards">
              {RECOMMENDATIONS.map((item) => (
                <div key={item.title} className="user-rec-card">
                  <span className="user-rec-tag">{item.tag}</span>
                  <div className="user-rec-title">{item.title}</div>
                  <div className="user-rec-meta">{item.meta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="user-chat-view">
          <div className="user-chat-toolbar">
            <a href="/architecture">架构图</a>
            <a href="/sessions">全部会话</a>
            <button type="button" onClick={handleLogout}>退出</button>
          </div>

          <div className="user-chat-messages">
            {chat.templateHints.length > 0 ? (
              chat.templateHints.map((hint) => (
                <div key={hint.templateId} className="user-template-card">
                  <div className="user-template-card-header">
                    <span className="user-template-badge">模板推荐</span>
                    <span style={{ fontSize: 13, color: 'var(--user-text-muted)' }}>
                      模板匹配
                    </span>
                  </div>
                  <p>
                    检测到相似问题模板「{hint.name}」，是否按标准格式查看？
                    <br />
                    {hint.preview}
                  </p>
                  <div className="user-template-actions">
                    <button
                      type="button"
                      className="user-btn user-btn-accent"
                      onClick={() => setInput(hint.preview.replace('{repo}', '当前项目').replace('{topic}', '核心模块'))}
                    >
                      套用模板
                    </button>
                    <button type="button" className="user-btn user-btn-ghost">忽略</button>
                  </div>
                </div>
              ))
            ) : null}

            {loadingMessages ? (
              <div className="user-msg assistant">
                <span className="user-msg-label">灵镜</span>
                <div className="user-msg-bubble">加载历史消息…</div>
              </div>
            ) : null}

            {!loadingMessages && messages.length === 0 && !chat.streaming && !chat.content ? (
              <div className="user-msg assistant">
                <span className="user-msg-label">灵镜</span>
                <div className="user-msg-bubble">输入问题开始对话…</div>
              </div>
            ) : null}

            {messages.map((msg) => (
              <div key={msg.id} className={`user-msg ${msg.role}`}>
                <span className="user-msg-label">{msg.role === 'user' ? '我' : '灵镜'}</span>
                <div className="user-msg-bubble">
                  {msg.content}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                    <div style={{ marginTop: 4 }}>
                      {msg.sources.map((source) => (
                        <span key={`${msg.id}-${source.title}-${source.ref ?? ''}`} className="user-source-tag">
                          📄 来源：{source.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {msg.role === 'assistant' && msg.interrupted ? (
                    <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--user-text-muted)', fontStyle: 'italic' }}>
                      （已中断）
                    </span>
                  ) : null}
                </div>
              </div>
            ))}

            {chat.streaming || chat.content ? (
              <div className="user-msg assistant">
                <span className="user-msg-label">灵镜</span>
                <div className="user-msg-bubble">
                  {chat.content || '思考中…'}
                  {chat.sources.length > 0 ? (
                    <div style={{ marginTop: 4 }}>
                      {chat.sources.map((source) => (
                        <span key={`stream-${source.title}-${source.ref ?? ''}`} className="user-source-tag">
                          📄 来源：{source.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {chat.streaming && chat.status ? (
              <div className="user-status-line">
                <span className="user-status-dot" />
                {chat.status.stepLabel ?? `阶段：${chat.status.phase}`}
              </div>
            ) : null}

            {chat.error ? <div className="user-error-text">{chat.error}</div> : null}
          </div>

          <div className="user-chat-input-area">
            <div className="user-input-wrap">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="继续追问，或输入新问题…"
                disabled={chat.streaming}
              />
              <button
                type="button"
                className="user-send-btn"
                title="发送"
                onClick={handleSend}
                disabled={chat.streaming || !input.trim()}
              >
                ↑
              </button>
              {chat.streaming ? (
                <button type="button" className="user-stop-btn" onClick={chat.stop}>
                  停止
                </button>
              ) : null}
            </div>
            <p className="user-input-hint">Enter 发送 · Shift+Enter 换行 · 支持连续追问</p>
          </div>
        </div>
      )}
    </UserShell>
  );
}
