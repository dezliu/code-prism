'use client';

import { Button, Card, List, Popconfirm, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function SessionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{ chatSessions: ChatSession[] }>(`
          query { chatSessions { id title updatedAt } }
        `);
        setSessions(data.chatSessions);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const loadMessages = async (sessionId: string) => {
    setActiveId(sessionId);
    try {
      const data = await gql<{ chatMessages: ChatMessage[] }>(`
        query($sessionId: ID!) { chatMessages(sessionId: $sessionId) { id role content createdAt } }
      `, { sessionId });
      setMessages(data.chatMessages);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载消息失败');
    }
  };

  const createSession = async () => {
    try {
      const data = await gql<{ createChatSession: ChatSession }>(`
        mutation { createChatSession(title: "新会话") { id title updatedAt } }
      `);
      setSessions((prev) => [data.createChatSession, ...prev]);
      router.push(`/?sessionId=${data.createChatSession.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await gql(`
        mutation($sessionId: ID!) { deleteChatSession(sessionId: $sessionId) }
      `, { sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeId === sessionId) {
        setActiveId(null);
        setMessages([]);
      }
      message.success('会话已删除');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  return (
    <AppShell appTitle="用户平台" accentColor="#f97316">
      <PageHeader
        title="历史会话"
        description={user ? user.displayName : ''}
        extra={
          <Space>
            <Button onClick={() => router.push('/')}>返回问答</Button>
            <Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>
          </Space>
        }
      />
      <Space align="start" style={{ width: '100%' }}>
        <Card title="会话列表" style={{ width: 320 }}>
          <Button type="primary" block style={{ marginBottom: 12 }} onClick={createSession}>
            新建会话
          </Button>
          <List
            dataSource={sessions}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', background: activeId === item.id ? '#fff7e6' : undefined }}
                onClick={() => loadMessages(item.id)}
                actions={[
                  <Popconfirm
                    key="delete"
                    title="确定删除此会话？"
                    description="删除后无法恢复"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      deleteSession(item.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      onClick={(e) => e.stopPropagation()}
                    >
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta title={item.title} description={new Date(item.updatedAt).toLocaleString()} />
              </List.Item>
            )}
          />
        </Card>
        <Card title="消息记录" style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <Typography.Text type="secondary">选择会话查看历史消息</Typography.Text>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={{ marginBottom: 12 }}>
                <Tag role={msg.role}>{msg.role}</Tag>
                <Typography.Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </Typography.Paragraph>
              </div>
            ))
          )}
          {activeId ? (
            <Button type="link" onClick={() => router.push(`/?sessionId=${activeId}`)}>
              在此会话继续对话
            </Button>
          ) : null}
        </Card>
      </Space>
    </AppShell>
  );
}

function Tag({ role, children }: { role: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0 8px',
      borderRadius: 4,
      background: role === 'assistant' ? '#e6f4ff' : '#f6ffed',
      fontSize: 12,
    }}>
      {children}
    </span>
  );
}
