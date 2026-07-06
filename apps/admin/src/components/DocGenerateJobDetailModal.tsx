'use client';

import { Button, Modal, Space, Tag, Typography, message } from 'antd';
import type { DocGenerateJob } from '@lingprism/graphql';
import {
  applyDocGenerateJob,
  cancelDocGenerateJob,
} from '@lingprism/graphql';

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

const STATUS_COLOR: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

export interface DocGenerateJobDetailModalProps {
  open: boolean;
  job: DocGenerateJob | null;
  onClose: () => void;
  onRefresh?: () => void;
  onOpenEdit?: (itemId: string, content: string) => void;
}

export function DocGenerateJobDetailModal({
  open,
  job,
  onClose,
  onRefresh,
  onOpenEdit,
}: DocGenerateJobDetailModalProps) {
  if (!job) {
    return null;
  }

  const isActive = job.status === 'queued' || job.status === 'running';
  const isCompleted = job.status === 'completed';

  const handleCancel = async () => {
    await cancelDocGenerateJob(job.id);
    onRefresh?.();
    onClose();
  };

  const handleApply = async () => {
    await applyDocGenerateJob(job.id);
    message.success('已应用到文档');
    onRefresh?.();
    onClose();
  };

  const handleOpenEdit = () => {
    if (!job.content) {
      return;
    }
    onOpenEdit?.(job.itemId, job.content);
    onClose();
  };

  return (
    <Modal
      title="生成任务详情"
      open={open}
      onCancel={onClose}
      width={760}
      footer={(
        <Space>
          {isActive && (
            <Button danger onClick={() => void handleCancel()}>
              取消任务
            </Button>
          )}
          {isCompleted && (
            <>
              <Button onClick={() => void handleApply()}>应用到文档</Button>
              <Button type="primary" onClick={handleOpenEdit}>
                打开编辑
              </Button>
            </>
          )}
          <Button onClick={onClose}>关闭</Button>
        </Space>
      )}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Typography.Text type="secondary">文档：</Typography.Text>
          <Typography.Text strong>{job.itemTitle}</Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">知识库：</Typography.Text>
          <Typography.Text>{job.knowledgeBaseTitle ?? job.knowledgeBaseId}</Typography.Text>
        </div>
        <div>
          <Typography.Text type="secondary">状态：</Typography.Text>
          <Tag color={STATUS_COLOR[job.status] ?? 'default'}>
            {STATUS_LABEL[job.status] ?? job.status}
          </Tag>
          {job.phase && (
            <Tag>{PHASE_LABEL[job.phase] ?? job.phase}</Tag>
          )}
        </div>
        {job.errorMessage && (
          <Typography.Text type="danger">{job.errorMessage}</Typography.Text>
        )}
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            生成内容预览
          </Typography.Text>
          <div
            style={{
              maxHeight: 360,
              overflowY: 'auto',
              padding: 12,
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              background: '#fafafa',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {job.content || (isActive ? '生成中，请稍候…' : '暂无内容')}
          </div>
        </div>
      </Space>
    </Modal>
  );
}
