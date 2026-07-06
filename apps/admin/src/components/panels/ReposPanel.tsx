'use client';

import {
  Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { gql } from '../../lib/gql';

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
}

export function ReposPanel() {
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [metaModal, setMetaModal] = useState<RepoRow | null>(null);
  const [metaForm] = Form.useForm();

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await gql<{ repos: RepoRow[] }>(`
        query {
          repos {
            id name url connectionStatus indexStatus indexedInSearch enabled
            displayName tags businessOwner techOwner languageSummary lastCommitSummary
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
      <Card type="inner" title="新增仓库" style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={onCreate}>
          <Form.Item name="url" rules={[{ required: true, message: '请输入 Git 地址' }]}>
            <Input placeholder="https://github.com/org/repo.git" style={{ width: 320 }} />
          </Form.Item>
          <Form.Item name="authType" initialValue="https">
            <Select style={{ width: 100 }} options={[{ value: 'https', label: 'HTTPS' }, { value: 'ssh', label: 'SSH' }]} />
          </Form.Item>
          <Form.Item name="defaultBranch" initialValue="main">
            <Input placeholder="分支" style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="authToken">
            <Input.Password placeholder="Token（可选）" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">保存并测试连接</Button>
          </Form.Item>
        </Form>
      </Card>
      <Card
        type="inner"
        title="仓库列表"
        extra={
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
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredRepos}
          columns={[
            { title: '名称', dataIndex: 'displayName', render: (_, row) => row.displayName || row.name },
            { title: '地址', dataIndex: 'url', ellipsis: true },
            {
              title: '语言分布',
              render: (_, row) => row.languageSummary
                ? Object.entries(row.languageSummary).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(', ')
                : '-',
            },
            {
              title: '连接',
              dataIndex: 'connectionStatus',
              render: (v: string) => <Tag color={v === 'connected' ? 'green' : 'red'}>{v}</Tag>,
            },
            { title: '索引', dataIndex: 'indexStatus' },
            {
              title: '纳入检索库',
              render: (_, row) => (
                <Switch checked={row.indexedInSearch} onChange={(checked) => toggleIndexed(row.id, checked)} />
              ),
            },
            {
              title: '启用',
              render: (_, row) => (
                <Switch checked={row.enabled} onChange={(checked) => toggleEnabled(row.id, checked)} />
              ),
            },
            {
              title: '操作',
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => openMetaModal(row)}>元数据</Button>
                  <Button size="small" onClick={() => retestConnection(row.id)}>重测</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
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
    </>
  );
}
