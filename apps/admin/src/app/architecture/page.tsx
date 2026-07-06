'use client';

import { Button, Card, Input, Select, Space, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { ArchitectureGraph, type GraphData } from '@lingprism/graph-viz';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';

interface RepoOption {
  id: string;
  name: string;
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
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export default function AdminArchitecturePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [repoId, setRepoId] = useState<string>();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [versionNote, setVersionNote] = useState('');

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{ repos: RepoOption[] }>(`query { repos { id name displayName } }`);
        setRepos(data.repos);
        if (data.repos[0]) setRepoId(data.repos[0].id);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const generateDraft = async () => {
    if (!repoId) return;
    try {
      const data = await gql<{ generateArchDraft: { graphData: GraphData } }>(`
        mutation($repoId: ID!) { generateArchDraft(repoId: $repoId) { graphData } }
      `, { repoId });
      setGraph(data.generateArchDraft.graphData);
      message.success('草稿已生成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    }
  };

  const publish = async () => {
    if (!repoId || !versionNote.trim()) {
      message.warning('请填写版本说明');
      return;
    }
    try {
      await gql(`
        mutation($repoId: ID!, $versionNote: String!) {
          publishOfficialArchitecture(repoId: $repoId, versionNote: $versionNote) { id version }
        }
      `, { repoId, versionNote });
      message.success('官方架构图已发布');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    }
  };

  return (
    <AppShell appTitle="管理后台" accentColor="#6366f1">
      <PageHeader
        title="架构图管理"
        description={user ? `管理员：${user.displayName}` : ''}
        extra={
          <Space>
            <Button onClick={() => router.push('/repos')}>代码源</Button>
            <Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>
          </Space>
        }
      />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            style={{ width: 280 }}
            value={repoId}
            onChange={setRepoId}
            options={repos.map((r) => ({ value: r.id, label: r.displayName || r.name }))}
          />
          <Button type="primary" onClick={generateDraft}>生成草稿</Button>
          <Input
            placeholder="发布说明"
            value={versionNote}
            onChange={(e) => setVersionNote(e.target.value)}
            style={{ width: 240 }}
          />
          <Button onClick={publish}>发布官方版</Button>
        </Space>
      </Card>
      <Card title="架构草稿预览">
        {graph ? (
          <ArchitectureGraph data={graph} />
        ) : (
          '选择仓库并点击「生成草稿」'
        )}
      </Card>
    </AppShell>
  );
}
