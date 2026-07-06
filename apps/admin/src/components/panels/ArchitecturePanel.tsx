'use client';

import {
  Button, Card, Form, Input, Modal, Select, Space, Table, Tag, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ArchitectureGraph, type GraphData } from '@lingprism/graph-viz';
import { gql } from '../../lib/gql';

interface ArchitectureSummary {
  id: string;
  repoId: string;
  version: number;
  isOfficial: boolean;
  versionNote: string | null;
  nodeCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

interface AdminArchitectureItem {
  repoId: string;
  repoName: string | null;
  draft: ArchitectureSummary | null;
  official: ArchitectureSummary | null;
}

interface RepoOption {
  id: string;
  name: string;
  displayName: string | null;
}

export function ArchitecturePanel() {
  const [items, setItems] = useState<AdminArchitectureItem[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editRepoId, setEditRepoId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [addForm] = Form.useForm();

  const listedRepoIds = useMemo(
    () => new Set(items.map((item) => item.repoId)),
    [items],
  );

  const addableRepos = useMemo(
    () => repos.filter((r) => !listedRepoIds.has(r.id)),
    [repos, listedRepoIds],
  );

  const loadRepos = async () => {
    try {
      const data = await gql<{ repos: RepoOption[] }>(`
        query { repos { id name displayName } }
      `);
      setRepos(data.repos);
    } catch {
      // 列表页仍可展示
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await gql<{ adminArchitectures: AdminArchitectureItem[] }>(`
        query {
          adminArchitectures {
            repoId
            repoName
            draft { id version nodeCount updatedAt }
            official { id version versionNote nodeCount publishedAt }
          }
        }
      `);
      setItems(data.adminArchitectures);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
    loadItems();
  }, []);

  const openAddModal = () => {
    addForm.resetFields();
    setAddModalOpen(true);
  };

  const onAddGenerate = async (values: { repoId: string }) => {
    setGenerating(true);
    try {
      await gql(`
        mutation($repoId: ID!) {
          generateArchDraft(repoId: $repoId) { id repoId }
        }
      `, { repoId: values.repoId });
      message.success('架构图草稿已生成');
      setAddModalOpen(false);
      addForm.resetFields();
      await loadItems();
      await openEditModal(values.repoId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const openEditModal = async (repoId: string) => {
    setEditRepoId(repoId);
    setGraph(null);
    setVersionNote('');
    try {
      const data = await gql<{
        architectureDraft: { graphData: GraphData } | null;
        officialArchitecture: { graphData: GraphData; versionNote: string | null } | null;
      }>(`
        query($repoId: ID!) {
          architectureDraft(repoId: $repoId) {
            graphData { nodes { id label type } edges { id source target label } }
          }
          officialArchitecture(repoId: $repoId) {
            graphData { nodes { id label type } edges { id source target label } }
            versionNote
          }
        }
      `, { repoId });
      const draft = data.architectureDraft?.graphData ?? null;
      setGraph(draft ?? data.officialArchitecture?.graphData ?? null);
      if (!draft && data.officialArchitecture?.versionNote) {
        setVersionNote(data.officialArchitecture.versionNote);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载架构图失败');
    }
  };

  const onRegenerate = async () => {
    if (!editRepoId) return;
    setGenerating(true);
    try {
      const data = await gql<{ generateArchDraft: { graphData: GraphData } }>(`
        mutation($repoId: ID!) {
          generateArchDraft(repoId: $repoId) {
            graphData { nodes { id label type } edges { id source target label } }
          }
        }
      `, { repoId: editRepoId });
      setGraph(data.generateArchDraft.graphData);
      message.success('草稿已重新生成');
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const onPublish = async () => {
    if (!editRepoId || !versionNote.trim()) {
      message.warning('请填写版本说明');
      return;
    }
    setPublishing(true);
    try {
      await gql(`
        mutation($repoId: ID!, $versionNote: String!) {
          publishOfficialArchitecture(repoId: $repoId, versionNote: $versionNote) { id version }
        }
      `, { repoId: editRepoId, versionNote });
      message.success('官方架构图已发布');
      setEditRepoId(null);
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const editItem = items.find((item) => item.repoId === editRepoId);
  const hasDraft = !!editItem?.draft;

  return (
    <>
      <div className="admin-panel">
        <Card
          type="inner"
          title="架构图列表"
          className="admin-panel-inner"
          extra={(
            <Button type="primary" onClick={openAddModal}>添加架构图</Button>
          )}
        >
          <Table
            rowKey="repoId"
            loading={loading}
            dataSource={items}
            locale={{ emptyText: '暂无架构图，点击「添加架构图」选择代码库生成' }}
            columns={[
              {
                title: '代码库',
                dataIndex: 'repoName',
                render: (name: string | null, row) => (
                  <Button
                    type="link"
                    style={{ padding: 0 }}
                    onClick={() => openEditModal(row.repoId)}
                  >
                    {name ?? row.repoId.slice(0, 8)}
                  </Button>
                ),
              },
              {
                title: '草稿',
                dataIndex: 'draft',
                width: 140,
                render: (draft: ArchitectureSummary | null) => (
                  draft
                    ? <Tag>{draft.nodeCount} 个节点</Tag>
                    : <span style={{ color: '#999' }}>无</span>
                ),
              },
              {
                title: '官方版',
                dataIndex: 'official',
                width: 160,
                render: (official: ArchitectureSummary | null) => (
                  official
                    ? (
                      <Tag color="green">
                        v{official.version}
                        {official.versionNote ? ` · ${official.versionNote}` : ''}
                      </Tag>
                    )
                    : <span style={{ color: '#999' }}>未发布</span>
                ),
              },
              {
                title: '操作',
                width: 160,
                render: (_, row) => (
                  <Space size="small">
                    <Button size="small" type="link" onClick={() => openEditModal(row.repoId)}>
                      {row.draft ? '编辑草稿' : '查看'}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Modal
        title="添加架构图"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        onOk={() => addForm.submit()}
        okText="生成草稿"
        confirmLoading={generating}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={onAddGenerate}>
          <Form.Item
            name="repoId"
            label="选择代码库"
            rules={[{ required: true, message: '请选择代码库' }]}
            extra="将从代码索引自动生成架构图草稿"
          >
            <Select
              showSearch
              placeholder="选择要生成架构图的代码库"
              optionFilterProp="label"
              options={addableRepos.map((r) => ({
                value: r.id,
                label: r.displayName || r.name,
              }))}
              notFoundContent={repos.length ? '所有代码库均已添加' : '请先在代码源管理中添加代码库'}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editItem ? `架构图 · ${editItem.repoName ?? editItem.repoId.slice(0, 8)}` : '架构图编辑'}
        open={!!editRepoId}
        onCancel={() => setEditRepoId(null)}
        width={900}
        footer={(
          <Space>
            <Button onClick={() => setEditRepoId(null)}>关闭</Button>
            <Button loading={generating} onClick={onRegenerate}>重新生成</Button>
            <Input
              placeholder="发布说明，如 2026-Q2 架构"
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              style={{ width: 240 }}
            />
            <Button type="primary" loading={publishing} disabled={!hasDraft} onClick={onPublish}>
              发布官方版
            </Button>
          </Space>
        )}
        destroyOnClose
      >
        {graph ? (
          <ArchitectureGraph data={graph} />
        ) : (
          <p style={{ color: '#999', textAlign: 'center', padding: '48px 0' }}>
            暂无架构图数据，请点击「重新生成」从代码库生成草稿
          </p>
        )}
      </Modal>
    </>
  );
}
