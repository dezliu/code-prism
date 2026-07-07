'use client';

import {
  Badge, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { gql } from '../../lib/gql';
import { useIndexJobActions } from '../IndexJobShell';

interface RepoRow {
  id: string;
  name: string;
  url: string;
  connectionStatus: string;
  indexStatus: string | null;
  indexedInSearch: boolean;
  enabled: boolean;
  displayName: string | null;
  tags: string[];
  businessOwner: string | null;
  techOwner: string | null;
  languageSummary: Record<string, number> | null;
  lastCommitSummary: string | null;
  syncStatus: string;
  syncError: string | null;
  hasPendingCommit: boolean;
  remoteCommitHash: string | null;
  indexedCommitHash: string | null;
}

export function ReposPanel() {
  const jobActions = useIndexJobActions();
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [metaModal, setMetaModal] = useState<RepoRow | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [errorModal, setErrorModal] = useState<{ repoName: string; error: string } | null>(null);
  const [syncingRepoId, setSyncingRepoId] = useState<string | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [metaForm] = Form.useForm();
  const [createForm] = Form.useForm();

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await gql<{ repos: RepoRow[] }>(`
        query {
          repos {
            id name url connectionStatus indexStatus indexedInSearch enabled
            displayName tags businessOwner techOwner languageSummary lastCommitSummary
            syncStatus syncError hasPendingCommit remoteCommitHash indexedCommitHash
          }
        }
      `);
      setRepos(data.repos);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const filteredRepos = useMemo(() => {
    if (statusFilter === 'all') return repos;
    return repos.filter((r) => r.connectionStatus === statusFilter || r.indexStatus === statusFilter);
  }, [repos, statusFilter]);

  const onCreate = async (values: { url: string; authType: string; defaultBranch?: string; authToken?: string }) => {
    try {
      await gql(
        `mutation($input: CreateRepoInput!) { createRepo(input: $input) { id } }`,
        {
          input: {
            url: values.url,
            authType: values.authType || 'https',
            defaultBranch: values.defaultBranch || 'main',
            authToken: values.authToken || undefined,
          },
        },
      );
      message.success('仓库已保存，正在后台克隆代码…');
      setCreateModalOpen(false);
      createForm.resetFields();
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const testConnectionByUrl = async () => {
    try {
      const values = await createForm.validateFields(['url', 'authType', 'defaultBranch']);
      setTestingConn(true);
      const result = await gql<{ testConnectionByUrl: { ok: boolean; error?: string } }>(
        `mutation($input: TestConnectionByUrlInput!) {
          testConnectionByUrl(input: $input) { ok error }
        }`,
        {
          input: {
            url: values.url,
            authType: values.authType || 'https',
            defaultBranch: values.defaultBranch || 'main',
          },
        },
      );
      if (result.testConnectionByUrl.ok) {
        message.success('连接测试成功');
      } else {
        message.error(result.testConnectionByUrl.error ?? '连接失败');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '测试失败');
    } finally {
      setTestingConn(false);
    }
  };

  const openCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ authType: 'https', defaultBranch: 'main' });
    setCreateModalOpen(true);
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

  const retestConnection = async (repoId: string) => {
    try {
      const result = await gql<{ testRepoConnection: { ok: boolean; error?: string } }>(
        `mutation($repoId: ID!) { testRepoConnection(repoId: $repoId) { ok error } }`,
        { repoId },
      );
      if (result.testRepoConnection.ok) {
        message.success('连接测试成功');
      } else {
        message.error(result.testRepoConnection.error ?? '连接失败');
      }
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '测试失败');
    }
  };

  const openMetaModal = (row: RepoRow) => {
    setMetaModal(row);
    metaForm.setFieldsValue({
      displayName: row.displayName ?? row.name,
      tags: row.tags?.join(', '),
      businessOwner: row.businessOwner,
      techOwner: row.techOwner,
    });
  };

  const saveMetadata = async () => {
    if (!metaModal) return;
    const values = await metaForm.validateFields();
    try {
      await gql(
        `mutation($repoId: ID!, $input: UpdateRepoMetadataInput!) {
          updateRepoMetadata(repoId: $repoId, input: $input) { id }
        }`,
        {
          repoId: metaModal.id,
          input: {
            displayName: values.displayName,
            tags: String(values.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean),
            businessOwner: values.businessOwner,
            techOwner: values.techOwner,
          },
        },
      );
      message.success('元数据已保存');
      setMetaModal(null);
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const syncAndIndex = async (repoId: string) => {
    setSyncingRepoId(repoId);
    try {
      const result = await gql<{ syncAndIndexRepo: { jobId: string; status: string } }>(
        `mutation($repoId: ID!) { syncAndIndexRepo(repoId: $repoId) { jobId status } }`,
        { repoId },
      );
      jobActions?.registerActiveJob(result.syncAndIndexRepo.jobId);
      jobActions?.refreshJobs();
      message.success('已加入索引队列');
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '索引触发失败');
    } finally {
      setSyncingRepoId(null);
    }
  };

  const deleteRepo = (row: RepoRow) => {
    Modal.confirm({
      title: '确认删除数据源？',
      content: `将删除「${row.displayName || row.name}」，关联的元数据、架构图与索引记录将一并移除，此操作不可恢复。`,
      okType: 'danger',
      onOk: async () => {
        try {
          await gql(`mutation($repoId: ID!) { deleteRepo(repoId: $repoId) }`, { repoId: row.id });
          message.success('数据源已删除');
          await loadRepos();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
        }
      },
    });
  };

  const toggleEnabled = async (repoId: string, enabled: boolean) => {
    try {
      await gql(
        `mutation($repoId: ID!, $input: UpdateRepoInput!) { updateRepo(repoId: $repoId, input: $input) { id enabled } }`,
        { repoId, input: { enabled } },
      );
      message.success(enabled ? '已启用' : '已禁用');
      await loadRepos();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    }
  };

  return (
    <>
      <div className="admin-panel">
        <Card
          type="inner"
          title="仓库列表"
          className="admin-panel-inner"
          extra={(
            <Space>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 160 }}
                options={[
                  { value: 'all', label: '全部' },
                  { value: 'connected', label: '已连接' },
                  { value: 'failed', label: '连接失败' },
                  { value: 'indexed', label: '已索引' },
                ]}
              />
              <Badge count={jobActions?.activeCount ?? 0} size="small">
                <Button onClick={() => jobActions?.openJobList()}>索引任务</Button>
              </Badge>
              <Button type="primary" onClick={openCreateModal}>新增仓库</Button>
            </Space>
          )}
        >
          <Table
            rowKey="id"
            loading={loading}
            dataSource={filteredRepos}
            scroll={{ x: 1200 }}
            columns={[
              { title: '名称', dataIndex: 'displayName', width: 140, fixed: 'left', render: (_, row) => row.displayName || row.name },
              { title: '地址', dataIndex: 'url', width: 240, ellipsis: true },
              {
                title: '语言分布',
                width: 160,
                render: (_, row) => row.languageSummary
                  ? Object.entries(row.languageSummary).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(', ')
                  : '-',
              },
              {
                title: '连接',
                dataIndex: 'connectionStatus',
                width: 100,
                render: (v: string) => <Tag color={v === 'connected' ? 'green' : 'red'}>{v}</Tag>,
              },
              { title: '索引', dataIndex: 'indexStatus', width: 100 },
              {
                title: '同步',
                width: 120,
                render: (_, row) => (
                  <Space direction="vertical" size={0}>
                    <Tag color={row.syncStatus === 'synced' ? 'green' : row.syncStatus === 'failed' ? 'red' : 'orange'}>
                      {row.syncStatus}
                    </Tag>
                    {row.hasPendingCommit && (
                      <Tag color="orange">有新 commit</Tag>
                    )}
                    {row.syncStatus === 'failed' && row.syncError && (
                      <Button
                        size="small"
                        type="link"
                        danger
                        onClick={() => setErrorModal({ repoName: row.displayName || row.name, error: row.syncError! })}
                        style={{ padding: 0, fontSize: 12 }}
                      >
                        查看原因
                      </Button>
                    )}
                  </Space>
                ),
              },
              {
                title: '纳入检索库',
                width: 110,
                render: (_, row) => (
                  <Switch checked={row.indexedInSearch} onChange={(checked) => toggleIndexed(row.id, checked)} />
                ),
              },
              {
                title: '启用',
                width: 80,
                render: (_, row) => (
                  <Switch checked={row.enabled} onChange={(checked) => toggleEnabled(row.id, checked)} />
                ),
              },
              {
                title: '操作',
                width: 200,
                fixed: 'right',
                render: (_, row) => (
                  <Space direction="vertical" size="small">
                    <Space>
                      <Button size="small" onClick={() => openMetaModal(row)}>元数据</Button>
                      <Button size="small" onClick={() => retestConnection(row.id)}>重测</Button>
                      <Button
                        size="small"
                        type="primary"
                        loading={syncingRepoId === row.id}
                        onClick={() => void syncAndIndex(row.id)}
                      >
                        同步索引
                      </Button>
                      <Button size="small" danger onClick={() => deleteRepo(row)}>删除</Button>
                    </Space>
                    {row.hasPendingCommit && (
                      <span style={{ color: '#fa8c16', fontSize: 12 }}>
                        建议重新索引
                        {row.lastCommitSummary ? `：${row.lastCommitSummary}` : ''}
                      </span>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <Modal
        title="新增仓库配置"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate}>
          <Form.Item name="url" label="仓库地址" rules={[{ required: true, message: '请输入 Git 地址' }]}>
            <Input placeholder="git@corp.example.com/repo.git" />
          </Form.Item>
          <Form.Item name="authType" label="认证方式" initialValue="https">
            <Select options={[{ value: 'https', label: 'HTTPS Token' }, { value: 'ssh', label: 'SSH 密钥' }]} />
          </Form.Item>
          <Form.Item name="defaultBranch" label="默认分支" initialValue="main">
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item name="authToken" label="认证凭据">
            <Input.Password placeholder="Token（可选）" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button onClick={() => setCreateModalOpen(false)}>取消</Button>
              <Button onClick={testConnectionByUrl} loading={testingConn}>测试连接</Button>
              <Button type="primary" htmlType="submit">保存配置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="编辑元数据" open={!!metaModal} onOk={saveMetadata} onCancel={() => setMetaModal(null)}>
        <Form form={metaForm} layout="vertical">
          <Form.Item name="displayName" label="业务中文名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="标签（逗号分隔）">
            <Input />
          </Form.Item>
          <Form.Item name="businessOwner" label="业务负责人">
            <Input />
          </Form.Item>
          <Form.Item name="techOwner" label="技术负责人">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`同步失败：${errorModal?.repoName}`}
        open={!!errorModal}
        onCancel={() => setErrorModal(null)}
        footer={<Button onClick={() => setErrorModal(null)}>关闭</Button>}
        width={600}
      >
        <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13, color: '#cf1322' }}>
          {errorModal?.error}
        </div>
      </Modal>
    </>
  );
}
