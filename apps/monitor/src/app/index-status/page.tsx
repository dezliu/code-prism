'use client';

import { Button, Card, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function IndexStatusPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [jobs, setJobs] = useState<Array<{ id: string; repoName: string | null; status: string; errorMessage: string | null }>>([]);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{ indexJobs: typeof jobs }>(
          `query { indexJobs { id repoName status errorMessage } }`,
        );
        setJobs(data.indexJobs);
      })
      .catch((error) => {
        message.error(error instanceof Error ? error.message : '加载失败');
        router.replace('/login');
      });
  }, [router]);

  return (
    <AppShell appTitle="监控平台" accentColor="#06b6d4">
      <PageHeader
        title="索引与更新状态"
        description={user ? `查看者：${user.displayName}` : ''}
        extra={<Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>}
      />
      <Card>
        <Table
          rowKey="id"
          dataSource={jobs}
          columns={[
            { title: '仓库', dataIndex: 'repoName' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (v: string) => (
                <Tag color={v === 'failed' ? 'red' : v === 'completed' ? 'green' : 'blue'}>{v}</Tag>
              ),
            },
            { title: '失败原因', dataIndex: 'errorMessage' },
          ]}
        />
      </Card>
    </AppShell>
  );
}
