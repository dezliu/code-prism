'use client';

import { Button, Modal, Space, Table, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';
import type { IndexJob } from '@lingprism/graphql';

export type IndexJobListTab = 'active' | 'completed' | 'failed';

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  queued: 'orange',
  running: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'default',
};

function formatTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export interface IndexJobListModalProps {
  open: boolean;
  jobs: IndexJob[];
  loading?: boolean;
  initialTab?: IndexJobListTab;
  onClose: () => void;
  onRefresh?: () => void;
}

export function IndexJobListModal({
  open,
  jobs,
  loading,
  initialTab = 'active',
  onClose,
  onRefresh,
}: IndexJobListModalProps) {
  const [activeTab, setActiveTab] = useState<IndexJobListTab>(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  const columns = [
    {
      title: '仓库',
      dataIndex: 'repoName',
      width: 160,
      ellipsis: true,
      render: (v: string | null, row: IndexJob) => v ?? row.repoId.slice(0, 8),
    },
    {
      title: '状态',
      width: 100,
      render: (_: unknown, row: IndexJob) => (
        <Tag color={STATUS_COLOR[row.status] ?? 'default'}>{STATUS_LABEL[row.status] ?? row.status}</Tag>
      ),
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '创建时间',
      width: 170,
      render: (_: unknown, row: IndexJob) => formatTime(row.createdAt),
    },
  ];

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  const tabItems = [
    {
      key: 'active',
      label: `进行中 (${activeJobs.length})`,
      children: (
        <Table rowKey="id" size="small" loading={loading} dataSource={activeJobs} columns={columns} pagination={false} />
      ),
    },
    {
      key: 'completed',
      label: `已完成 (${completedJobs.length})`,
      children: (
        <Table rowKey="id" size="small" loading={loading} dataSource={completedJobs} columns={columns} pagination={false} />
      ),
    },
    {
      key: 'failed',
      label: `失败 (${failedJobs.length})`,
      children: (
        <Table rowKey="id" size="small" loading={loading} dataSource={failedJobs} columns={columns} pagination={false} />
      ),
    },
  ];

  return (
    <Modal
      title="索引任务列表"
      open={open}
      onCancel={onClose}
      width={800}
      footer={(
        <Space>
          <Button onClick={() => onRefresh?.()}>刷新</Button>
          <Button type="primary" onClick={onClose}>关闭</Button>
        </Space>
      )}
      destroyOnClose
    >
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as IndexJobListTab)} items={tabItems} />
    </Modal>
  );
}
