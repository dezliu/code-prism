'use client';

import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Button, Modal, Steps, Typography } from 'antd';
import { useEffect, useRef } from 'react';
import {
  useDocGenerateSSE,
  type DocGeneratePhase,
} from '@lingprism/graphql';

const PHASE_STEPS: Array<{ key: DocGeneratePhase; title: string }> = [
  { key: 'fetching_code', title: '正在拉取代码' },
  { key: 'analyzing', title: '正在思考' },
  { key: 'generating', title: '正在生成' },
];

function phaseIndex(phase: DocGeneratePhase | undefined): number {
  if (!phase) {
    return 0;
  }
  const index = PHASE_STEPS.findIndex((step) => step.key === phase);
  return index >= 0 ? index : 0;
}

export interface DocGenerateProgressModalProps {
  open: boolean;
  itemId: string | null;
  title?: string;
  docType?: string;
  onClose: () => void;
  onComplete: (content: string) => void;
}

export function DocGenerateProgressModal({
  open,
  itemId,
  title,
  docType,
  onClose,
  onComplete,
}: DocGenerateProgressModalProps) {
  const {
    content,
    status,
    streaming,
    error,
    interrupted,
    generate,
    stop,
    reset,
  } = useDocGenerateSSE();
  const contentRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      reset();
      return;
    }

    if (!itemId || startedRef.current) {
      return;
    }

    startedRef.current = true;
    void generate({ itemId, title, docType });
  }, [open, itemId, title, docType, generate, reset]);

  const currentPhase = status?.phase;
  const activeStep = phaseIndex(currentPhase);
  const finished = !streaming && !error && Boolean(content) && !interrupted;
  const canApply = Boolean(content) && !streaming;

  const handleApply = () => {
    if (!content) {
      return;
    }
    onComplete(content);
    onClose();
  };

  return (
    <Modal
      title="从代码生成文档"
      open={open}
      onCancel={() => {
        if (streaming) {
          void stop();
        }
        onClose();
      }}
      width={760}
      footer={(
        <>
          {streaming && (
            <Button danger onClick={() => void stop()}>
              停止生成
            </Button>
          )}
          <Button disabled={streaming} onClick={onClose}>
            关闭
          </Button>
          {canApply && (
            <Button type="primary" onClick={handleApply}>
              使用生成文档
            </Button>
          )}
        </>
      )}
      destroyOnClose
      maskClosable={!streaming}
    >
      <Steps
        size="small"
        current={activeStep}
        style={{ marginBottom: 20 }}
        items={PHASE_STEPS.map((step, index) => ({
          title: step.title,
          icon: finished && index <= activeStep
            ? <CheckCircleOutlined />
            : (streaming && index === activeStep ? <LoadingOutlined /> : undefined),
        }))}
      />

      {error && (
        <Typography.Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          {error}
        </Typography.Text>
      )}

      {interrupted && (
        <Typography.Text type="warning" style={{ display: 'block', marginBottom: 12 }}>
          生成已中断，可保留当前内容或重新生成。
        </Typography.Text>
      )}

      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        生成内容预览
      </Typography.Text>
      <div
        ref={contentRef}
        style={{
          height: 360,
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
        {content || (streaming ? '等待输出…' : '暂无内容')}
      </div>
    </Modal>
  );
}
