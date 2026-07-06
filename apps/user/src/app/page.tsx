'use client';

import { Button, Card, Input, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import {
  fetchCurrentUser,
  logout,
  useChatSSE,
  type AuthUser,
} from '@lingprism/graphql';

const { Text } = Typography;

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [input, setInput] = useState('');
  const chat = useChatSSE();

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

  const handleSend = async () => {
    const message = input.trim();
    if (!message || chat.streaming) {
      return;
    }
    setInput('');
    await chat.send(message);
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  if (checkingAuth) {
    return null;
  }

  return (
    <AppShell appTitle="用户平台" accentColor="#f97316">
      <PageHeader
        title="智能问答"
        description={`欢迎，${user?.displayName ?? user?.email}`}
      />

      <Card
        title="对话"
        extra={
          <Space>
            <Tag color="orange">{user?.role}</Tag>
            <Button size="small" onClick={handleLogout}>
              退出
            </Button>
          </Space>
        }
      >
        {chat.status ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            阶段：{chat.status.phase}
            {chat.interrupted ? '（已中断）' : ''}
          </Text>
        ) : null}

        <div
          style={{
            minHeight: 160,
            padding: 16,
            background: '#fafafa',
            borderRadius: 8,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
          }}
        >
          {chat.content || '输入问题开始对话…'}
        </div>

        {chat.error ? (
          <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
            {chat.error}
          </Text>
        ) : null}

        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例如：支付服务核心流程是什么？"
            onPressEnter={handleSend}
            disabled={chat.streaming}
          />
          <Button type="primary" onClick={handleSend} loading={chat.streaming}>
            发送
          </Button>
          <Button danger onClick={chat.stop} disabled={!chat.streaming}>
            停止
          </Button>
        </Space.Compact>
      </Card>
    </AppShell>
  );
}
