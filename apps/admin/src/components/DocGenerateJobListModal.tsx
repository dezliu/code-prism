'use client';

import { Badge, Button, Modal, Space, Table, Tabs, Tag } from 'antd';
import type { DocGenerateJob } from '@lingprism/graphql';

const PHASE_LABEL: Record<string, string> = {
  fetching_code: '拉取代码',
  analyzing: '分析中',
  generating: '生成中',
};

const STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '进行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function formatTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

export interface DocGenerateJobListModalProps {
  open: boolean;
  jobs: DocGenerateJob[];
  loading?: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onViewJob: (job: DocGenerateJob) => void;
}

export function DocGenerateJobListModal({
  open,
  jobs,
  loading,
  onClose,
  onRefresh,
  onViewJob,
}: DocGenerateJobListModalProps) {
  const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const completedJobs = jobs.filter((job) => job.status === 'completed');
  const failedJobs = jobs.filter((job) => job.status === 'failed' || job.status === 'cancelled');

  const columns = [
    {
      title: '文档',
      dataIndex: 'itemTitle',
      ellipsis: true,
    },
    {
      title: '知识库',
      dataIndex: 'knowledgeBaseTitle',
      width: 140,
      ellipsis: true,
      render: (value: string | null, row: DocGenerateJob) => value ?? row.knowledgeBaseId.slice(0, 8),
    },
    {
      title: '状态',
      width: 120,
      render: (_: unknown, row: DocGenerateJob) => (
        <Space size={4}>
          <Tag>{STATUS_LABEL[row.status] ?? row.status}</Tag>
          {row.phase && (
            <Tag color="blue">{PHASE_LABEL[row.phase] ?? row.phase}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '创建时间',
      width: 170,
      render: (_: unknown, row: DocGenerateJob) => formatTime(row.createdAt),
    },
    {
      title: '操作',
      width: 90,
      render: (_: unknown, row: DocGenerateJob) => (
        <Button type="link" size="small" onClick={() => onViewJob(row)}>
          详情
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'active',
      label: (
        <Badge count={activeJobs.length} size="small" offset={[6, 0]}>
          进行中
        </Badge>
      ),
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={activeJobs}
          columns={columns}
          pagination={false}
        />
      ),
    },
    {
      key: 'completed',
      label: `已完成 (${completedJobs.length})`,
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={completedJobs}
          columns={columns}
          pagination={false}
        />
      ),
    },
    {
      key: 'failed',
      label: `失败 (${failedJobs.length})`,
      children: (
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={failedJobs}
          columns={columns}
          pagination={false}
        />
      ),
    },
  ];

  return (
    <Modal
      title="后台生成任务"
      open={open}
      onCancel={onClose}
      width={920}
      footer={(
        <Space>
          <Button onClick={() => onRefresh?.()}>刷新</Button>
          <Button type="primary" onClick={onClose}>关闭</Button>
        </Space>
      )}
      destroyOnClose
    >
      <Tabs items={tabItems} />
    </Modal>
  );
}
