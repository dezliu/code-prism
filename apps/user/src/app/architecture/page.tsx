'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArchitectureGraphViewer, type GraphData, type GraphNode } from '@lingprism/graph-viz';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { UserShell } from '../../components/UserShell';

interface ArchitectureItem {
  id: string;
  repoId: string;
  repoName: string | null;
  graphData: GraphData;
}

interface KnowledgeBase {
  id: string;
  title: string;
  repoIds: string[];
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
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
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
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
        
        // 加载架构图
        const archData = await gql<{ officialArchitectures: ArchitectureItem[] }>(
          `query {
            officialArchitectures {
              id repoId repoName
              graphData { nodes { id label type } edges { id source target label } }
            }
          }`,
        );
        setItems(archData.officialArchitectures);
        if (archData.officialArchitectures[0]) {
          setSelectedRepoId(archData.officialArchitectures[0].repoId);
        }
        
        // 加载知识库列表
        const kbData = await gql<{ knowledgeBases: KnowledgeBase[] }>(
          `query {
            knowledgeBases {
              id
              title
              repoIds
              itemCount
            }
          }`,
        );
        setKnowledgeBases(kbData.knowledgeBases);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const current = items.find((item) => item.repoId === selectedRepoId);
  
  // 查找与当前项目关联的知识库
  const relatedKnowledgeBase = current
    ? knowledgeBases.find((kb) => kb.repoIds.includes(current.repoId))
    : null;

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <UserShell user={user}>
      <div className="user-home-view">
        <h1 className="user-home-greeting">架构图浏览</h1>
        <p className="user-home-sub">
          查看官方发布的系统架构图，交互探索服务节点。
          {user ? ` 欢迎，${user.displayName}` : ''}
        </p>

        <div className="user-arch-toolbar">
          <select
            className="user-arch-select"
            value={selectedRepoId ?? ''}
            onChange={(e) => {
              setSelectedRepoId(e.target.value);
              setSelectedNode(null);
            }}
          >
            {items.length === 0 ? (
              <option value="">暂无项目</option>
            ) : (
              items.map((item) => (
                <option key={item.repoId} value={item.repoId}>
                  {item.repoName ?? item.repoId}
                </option>
              ))
            )}
          </select>
          <div className="user-arch-toolbar-actions">
            <a href="/">返回问答</a>
            <a href="/docs">文档中心</a>
            <button type="button" onClick={handleLogout}>退出</button>
          </div>
        </div>

        <div className="user-arch-panel">
          {current ? (
            <ArchitectureGraphViewer
              key={current.repoId}
              data={current.graphData}
              selectedNodeId={selectedNode?.id}
              onNodeClick={(node) => {
                setSelectedNode(node);
              }}
            />
          ) : (
            <p className="user-arch-empty">暂无已发布官方架构图，请联系管理员发布。</p>
          )}
        </div>

        {selectedNode ? (
          <div className="user-arch-node-detail">
            <h4>节点详情</h4>
            <p>名称：{selectedNode.label}</p>
            <p>类型：{selectedNode.type}</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="user-rec-section" style={{ marginTop: 36 }}>
            <h3>已发布项目</h3>
            <div className="user-rec-cards">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`user-arch-project-card${selectedRepoId === item.repoId ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedRepoId(item.repoId);
                    setSelectedNode(null);
                  }}
                >
                  <div>
                    <span className="user-rec-tag">架构图</span>
                    <div className="user-rec-title">{item.repoName ?? item.repoId}</div>
                    <div className="user-rec-meta">
                      {item.graphData.nodes.length} 个服务节点 · 已发布
                    </div>
                  </div>
                  <span style={{ color: 'var(--user-accent)', fontSize: 13, fontWeight: 600 }}>查看 →</span>
                </button>
              ))}
            </div>
            
            {/* 查看相关文档快捷入口 */}
            {relatedKnowledgeBase && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <a 
                  href={`/docs?knowledgeBaseId=${relatedKnowledgeBase.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '8px 20px',
                    background: '#f0f9ff',
                    border: '1px solid #1890ff',
                    borderRadius: 6,
                    color: '#1890ff',
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  📚 查看「{relatedKnowledgeBase.title}」相关文档
                </a>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </UserShell>
  );
}
