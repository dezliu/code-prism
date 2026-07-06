'use client';

import { Button, Card, Form, Input, Space, Switch, Table, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';

interface RepoRow {
  id: string;
  name: string;
  url: string;
  connectionStatus: string;
  indexStatus: string | null;
  indexedInSearch: boolean;
  displayName: string | null;
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
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

export default function ReposPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await gql<{ repos: RepoRow[] }>(`query { repos { id name url connectionStatus indexStatus indexedInSearch displayName } }`);
      setRepos(data.repos);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser()
      .then((current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        return loadRepos();
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const onCreate = async (values: { url: string; authType: string }) => {
    try {
      await gql(
        `mutation($input: CreateRepoInput!) { createRepo(input: $input) { id } }`,
        { input: { url: values.url, authType: values.authType || 'https' } },
      );
      message.success('仓库已创建并测试连接');
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const toggleIndexed = async (repoId: string, indexedInSearch: boolean) => {
    try {
      await gql(
        `mutation($repoId: ID!, $input: UpdateRepoMetadataInput!) {
          updateRepoMetadata(repoId: $repoId, input: $input) { id indexedInSearch }
        }`,
        { repoId, input: { indexedInSearch } },
      );
      message.success(indexedInSearch ? '已加入索引队列' : '已移出检索库');
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新失败');
    }
  };

  return (
    <AppShell appTitle="管理后台" accentColor="#6366f1">
      <PageHeader
        title="代码源管理"
        description={user ? `管理员：${user.displayName}` : ''}
        extra={<Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>}
      />
      <Card title="新增仓库" style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={onCreate}>
          <Form.Item name="url" rules={[{ required: true, message: '请输入 Git 地址' }]}>
            <Input placeholder="https://github.com/org/repo.git" style={{ width: 360 }} />
          </Form.Item>
          <Form.Item name="authType" initialValue="https">
            <Input placeholder="https / ssh" style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">保存并测试连接</Button>
          </Form.Item>
        </Form>
      </Card>
      <Card title="仓库列表">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={repos}
          columns={[
            { title: '名称', dataIndex: 'displayName', render: (_, row) => row.displayName || row.name },
            { title: '地址', dataIndex: 'url', ellipsis: true },
            {
              title: '连接状态',
              dataIndex: 'connectionStatus',
              render: (v: string) => <Tag color={v === 'connected' ? 'green' : 'red'}>{v}</Tag>,
            },
            { title: '索引状态', dataIndex: 'indexStatus' },
            {
              title: '纳入检索库',
              render: (_, row) => (
                <Switch
                  checked={row.indexedInSearch}
                  onChange={(checked) => toggleIndexed(row.id, checked)}
                />
              ),
            },
          ]}
        />
      </Card>
    </AppShell>
  );
}
