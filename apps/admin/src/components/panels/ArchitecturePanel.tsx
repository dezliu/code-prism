'use client';

import {
  Badge, Button, Card, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message, notification,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchitectureGraphViewer, type GraphData } from '@lingprism/graph-viz';
import {
  ARCH_PHASE_LABELS,
  enqueueArchGenerateJob,
  useArchGenerateJobPoll,
  useArchGenerateSSE,
  type ArchGenerateJob,
} from '@lingprism/graphql';
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

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running']);
const FAILED_JOB_STATUSES = new Set(['failed', 'cancelled']);

type JobListTab = 'active' | 'completed' | 'failed';

export function ArchitecturePanel() {
  const [items, setItems] = useState<AdminArchitectureItem[]>([]);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [jobListOpen, setJobListOpen] = useState(false);
  const [jobListTab, setJobListTab] = useState<JobListTab>('active');
  const [previewGraph, setPreviewGraph] = useState<{ title: string; data: GraphData } | null>(null);
  const [editRepoId, setEditRepoId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [publishing, setPublishing] = useState(false);
  /** 生成成功后草稿已入库，但 items 列表 state 可能尚未刷新 */
  const [draftReady, setDraftReady] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const editLoadSeqRef = useRef(0);
  const graphGenSeqRef = useRef(0);
  const [addForm] = Form.useForm();

  const {
    status: sseStatus,
    streaming,
    error: sseError,
    generate: generateStream,
    reset: resetSse,
  } = useArchGenerateSSE();

  const loadItems = async (): Promise<AdminArchitectureItem[]> => {
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
      return data.adminArchitectures;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleJobFinished = useCallback(
    (job: ArchGenerateJob) => {
      if (job.status === 'completed') {
        notification.success({
          message: '架构图生成完成',
          description: `「${job.repoName ?? job.repoId.slice(0, 8)}」草稿已生成。`,
          duration: 5,
        });
        void loadItems();
        if (editRepoId === job.repoId && job.graphData) {
          graphGenSeqRef.current += 1;
          setGraph(job.graphData as GraphData);
          setDraftReady(true);
        }
      } else if (job.status === 'failed') {
        notification.error({
          message: '架构图生成失败',
          description: job.errorMessage ?? '未知错误',
          duration: 8,
        });
      }
    },
    [editRepoId],
  );

  const { jobs, activeCount, loading: jobsLoading, refresh: refreshJobs } = useArchGenerateJobPoll({
    onJobFinished: handleJobFinished,
  });

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

  useEffect(() => {
    loadRepos();
    loadItems();
  }, []);

  useEffect(() => {
    if (sseError) {
      message.error(sseError);
    }
  }, [sseError]);

  const runStreamGenerate = async (repoId: string, openEditAfter = false) => {
    resetSse();
    const result = await generateStream(repoId);
    if (result) {
      graphGenSeqRef.current += 1;
      setGraph(result as GraphData);
      setDraftReady(true);
      message.success('架构图草稿已生成');
      await loadItems();
      if (openEditAfter) {
        await openEditModal(repoId, { keepGraph: true });
      }
    }
  };

  const openAddModal = () => {
    addForm.resetFields();
    setAddModalOpen(true);
  };

  const onAddGenerate = async (values: { repoId: string; mode?: 'stream' | 'background' }) => {
    const mode = values.mode ?? 'stream';
    if (mode === 'background') {
      try {
        await enqueueArchGenerateJob(values.repoId);
        message.success('已加入后台生成队列');
        setAddModalOpen(false);
        addForm.resetFields();
        void refreshJobs();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '提交失败');
      }
      return;
    }

    setAddModalOpen(false);
    addForm.resetFields();
    await runStreamGenerate(values.repoId, true);
  };

  const closeEditModal = () => {
    editLoadSeqRef.current += 1;
    setEditRepoId(null);
    setGraph(null);
    setDraftReady(false);
    setGraphLoading(false);
    setVersionNote('');
  };

  const openEditModal = async (
    repoId: string,
    options?: { keepGraph?: boolean },
  ) => {
    const loadSeq = ++editLoadSeqRef.current;
    const genSeqAtOpen = graphGenSeqRef.current;

    setEditRepoId(repoId);
    if (!options?.keepGraph) {
      setGraph(null);
      setDraftReady(false);
    }
    setVersionNote('');
    setGraphLoading(true);

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

      if (loadSeq !== editLoadSeqRef.current) {
        return;
      }
      if (graphGenSeqRef.current > genSeqAtOpen) {
        return;
      }

      const draft = data.architectureDraft?.graphData ?? null;
      if (!options?.keepGraph) {
        setGraph(draft ?? data.officialArchitecture?.graphData ?? null);
      }
      setDraftReady(!!draft || !!options?.keepGraph);
      if (!draft && data.officialArchitecture?.versionNote) {
        setVersionNote(data.officialArchitecture.versionNote);
      }
    } catch (error) {
      if (loadSeq === editLoadSeqRef.current) {
        message.error(error instanceof Error ? error.message : '加载架构图失败');
      }
    } finally {
      if (loadSeq === editLoadSeqRef.current) {
        setGraphLoading(false);
      }
    }
  };

  const onRegenerate = async () => {
    if (!editRepoId) return;
    await runStreamGenerate(editRepoId);
  };

  const onBackgroundGenerate = async (repoId: string, shouldCloseEditModal = false) => {
    try {
      await enqueueArchGenerateJob(repoId);
      message.success('已加入后台生成队列');
      void refreshJobs();
      if (shouldCloseEditModal) {
        closeEditModal();
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '提交失败');
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
      closeEditModal();
      await loadItems();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败');
    } finally {
      setPublishing(false);
    }
  };

  const editItem = items.find((item) => item.repoId === editRepoId);
  const hasDraft = !!editItem?.draft || draftReady;
  const phaseLabel = sseStatus ? ARCH_PHASE_LABELS[sseStatus.phase] : null;

  const activeJobs = useMemo(
    () => jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)),
    [jobs],
  );
  const completedJobs = useMemo(
    () => jobs.filter((job) => job.status === 'completed'),
    [jobs],
  );
  const failedJobs = useMemo(
    () => jobs.filter((job) => FAILED_JOB_STATUSES.has(job.status)),
    [jobs],
  );

  const jobTableColumns = useMemo(() => {
    const base = [
      {
        title: '代码库',
        dataIndex: 'repoName',
        render: (name: string | null, row: ArchGenerateJob) => name ?? row.repoId.slice(0, 8),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 160,
        render: (status: string, row: ArchGenerateJob) => (
          <Tag color={status === 'completed' ? 'green' : status === 'failed' || status === 'cancelled' ? 'red' : 'blue'}>
            {JOB_STATUS_LABELS[status] ?? status}
            {row.phase ? ` · ${ARCH_PHASE_LABELS[row.phase as keyof typeof ARCH_PHASE_LABELS] ?? row.phase}` : ''}
          </Tag>
        ),
      },
      {
        title: '节点数',
        width: 80,
        render: (_: unknown, row: ArchGenerateJob) => row.graphData?.nodes?.length ?? '—',
      },
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 160,
        render: (v: string) => new Date(v).toLocaleString(),
      },
    ];

    if (jobListTab === 'failed') {
      return [
        ...base.slice(0, 2),
        {
          title: '错误信息',
          dataIndex: 'errorMessage',
          ellipsis: true,
          render: (msg: string | null) => msg ?? '—',
        },
        ...base.slice(3),
      ];
    }

    if (jobListTab === 'completed') {
      return [
        ...base,
        {
          title: '操作',
          width: 100,
          render: (_: unknown, row: ArchGenerateJob) => (
            row.graphData ? (
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => setPreviewGraph({
                  title: row.repoName ?? row.repoId.slice(0, 8),
                  data: row.graphData as GraphData,
                })}
              >
                查看
              </Button>
            ) : '—'
          ),
        },
      ];
    }

    return base;
  }, [jobListTab]);

  const filteredJobs = jobListTab === 'active'
    ? activeJobs
    : jobListTab === 'completed'
      ? completedJobs
      : failedJobs;

  return (
    <>
      <div className="admin-panel">
        <Card
          type="inner"
          title="架构图列表"
          className="admin-panel-inner"
          extra={(
            <Space>
              <Badge count={activeCount} size="small">
                <Button onClick={() => {
                  setJobListTab(activeCount > 0 ? 'active' : 'completed');
                  setJobListOpen(true);
                }}
                >
                  后台任务
                </Button>
              </Badge>
              <Button type="primary" onClick={openAddModal}>添加架构图</Button>
            </Space>
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
                width: 220,
                render: (_, row) => (
                  <Space size="small">
                    <Button size="small" type="link" onClick={() => openEditModal(row.repoId)}>
                      {row.draft ? '编辑草稿' : '查看'}
                    </Button>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => void onBackgroundGenerate(row.repoId)}
                    >
                      后台生成
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
        footer={(
          <Space>
            <Button onClick={() => setAddModalOpen(false)}>取消</Button>
            <Button
              onClick={() => {
                addForm.setFieldValue('mode', 'background');
                addForm.submit();
              }}
            >
              后台生成
            </Button>
            <Button
              type="primary"
              loading={streaming}
              onClick={() => {
                addForm.setFieldValue('mode', 'stream');
                addForm.submit();
              }}
            >
              立即生成
            </Button>
          </Space>
        )}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" onFinish={onAddGenerate}>
          <Form.Item name="mode" hidden initialValue="stream">
            <Input />
          </Form.Item>
          <Form.Item
            name="repoId"
            label="选择代码库"
            rules={[{ required: true, message: '请选择代码库' }]}
            extra="将从 Git 仓库同步代码并由大模型生成系统架构图"
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
        title="架构图生成任务"
        open={jobListOpen}
        onCancel={() => setJobListOpen(false)}
        footer={<Button onClick={() => setJobListOpen(false)}>关闭</Button>}
        width={800}
        destroyOnClose
      >
        <Tabs
          activeKey={jobListTab}
          onChange={(key) => setJobListTab(key as JobListTab)}
          items={[
            {
              key: 'active',
              label: `生成中 (${activeJobs.length})`,
            },
            {
              key: 'completed',
              label: `完成 (${completedJobs.length})`,
            },
            {
              key: 'failed',
              label: `失败 (${failedJobs.length})`,
            },
          ]}
        />
        <Table
          rowKey="id"
          size="small"
          loading={jobsLoading}
          dataSource={filteredJobs}
          columns={jobTableColumns}
          pagination={{ pageSize: 8 }}
          locale={{
            emptyText: jobListTab === 'active'
              ? '暂无进行中的任务'
              : jobListTab === 'completed'
                ? '暂无已完成任务'
                : '暂无失败任务',
          }}
          style={{ marginTop: 8 }}
        />
      </Modal>

      <Modal
        title={`架构图预览 · ${previewGraph?.title ?? ''}`}
        open={!!previewGraph}
        onCancel={() => setPreviewGraph(null)}
        footer={<Button onClick={() => setPreviewGraph(null)}>关闭</Button>}
        width="92vw"
        style={{ top: 24, maxWidth: 1400 }}
        destroyOnClose
      >
        {previewGraph && (
          <ArchitectureGraphViewer data={previewGraph.data} height={560} />
        )}
      </Modal>

      <Modal
        title={editItem ? `架构图 · ${editItem.repoName ?? editItem.repoId.slice(0, 8)}` : '架构图编辑'}
        open={!!editRepoId}
        onCancel={closeEditModal}
        width={900}
        footer={(
          <Space wrap>
            <Button onClick={closeEditModal}>关闭</Button>
            <Button
              disabled={streaming}
              onClick={() => editRepoId && void onBackgroundGenerate(editRepoId, true)}
            >
              后台生成
            </Button>
            <Button loading={streaming} onClick={onRegenerate}>重新生成</Button>
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
        {streaming && phaseLabel && (
          <p style={{ color: '#1677ff', marginBottom: 12 }}>{phaseLabel}</p>
        )}
        {graphLoading && !graph && (
          <p style={{ color: '#999', textAlign: 'center', padding: '48px 0' }}>加载架构图…</p>
        )}
        {!graphLoading && graph ? (
          <ArchitectureGraphViewer key={editRepoId ?? undefined} data={graph} />
        ) : !graphLoading && !graph ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '48px 0' }}>
            暂无架构图数据，请点击「重新生成」从代码库生成草稿
          </p>
        ) : null}
      </Modal>
    </>
  );
}
