'use client';

import { Button, Card, List, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageHeader } from '@lingprism/ui';
import { ArchitectureGraph, type GraphData, type GraphNode } from '@lingprism/graph-viz';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';

const { Text } = Typography;

interface ArchitectureItem {
  id: string;
  repoId: string;
  repoName: string | null;
  graphData: GraphData;
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

export default function ArchitecturePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<ArchitectureItem[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{ officialArchitectures: ArchitectureItem[] }>(
          `query {
            officialArchitectures {
              id repoId repoName
              graphData { nodes { id label type } edges { id source target label } }
            }
          }`,
        );
        setItems(data.officialArchitectures);
        if (data.officialArchitectures[0]) {
          setSelectedRepoId(data.officialArchitectures[0].repoId);
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const current = items.find((item) => item.repoId === selectedRepoId);

  return (
    <AppShell appTitle="用户平台" accentColor="#f97316">
      <PageHeader
        title="架构图浏览"
        description={user ? `欢迎，${user.displayName}` : ''}
        extra={
          <Space>
            <Button href="/">返回问答</Button>
            <Button onClick={() => { logout(); router.replace('/login'); }}>退出</Button>
          </Space>
        }
      />
      <Card
        title="官方架构图"
        extra={
          <Select
            style={{ width: 240 }}
            placeholder="选择项目"
            value={selectedRepoId}
            onChange={setSelectedRepoId}
            options={items.map((item) => ({
              value: item.repoId,
              label: item.repoName ?? item.repoId,
            }))}
          />
        }
      >
        {current ? (
          <ArchitectureGraph
            data={current.graphData}
            selectedNodeId={selectedNode?.id}
            onNodeClick={(node) => {
              setSelectedNode(node);
              message.info(`已选择节点：${node.label}`);
            }}
          />
        ) : (
          <Text type="secondary">暂无已发布官方架构图，请联系管理员发布。</Text>
        )}
        {selectedNode ? (
          <Card size="small" style={{ marginTop: 16 }} title="节点详情">
            <p>名称：{selectedNode.label}</p>
            <p>类型：{selectedNode.type}</p>
          </Card>
        ) : null}
      </Card>
      <Card title="已发布项目" style={{ marginTop: 16 }}>
        <List
          dataSource={items}
          renderItem={(item) => (
            <List.Item>
              {item.repoName ?? item.repoId}
              <Button type="link" onClick={() => setSelectedRepoId(item.repoId)}>查看</Button>
            </List.Item>
          )}
        />
      </Card>
    </AppShell>
  );
}
