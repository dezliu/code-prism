'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Space, notification } from 'antd';
import type { DocGenerateJob } from '@lingprism/graphql';
import {
  fetchDocGenerateJob,
  useDocGenerateJobPoll,
} from '@lingprism/graphql';
import { DocGenerateJobDetailModal } from './DocGenerateJobDetailModal';
import { DocGenerateJobListModal } from './DocGenerateJobListModal';

export interface DocGenerateJobActions {
  openJobList: () => void;
  openJobDetail: (jobId: string) => void;
  openEditWithContent: (itemId: string, content: string) => void;
  refreshJobs: () => void;
  jobs: DocGenerateJob[];
  activeCount: number;
}

const DocGenerateJobActionsContext = createContext<DocGenerateJobActions | null>(null);

export function useDocGenerateJobActions(): DocGenerateJobActions | null {
  return useContext(DocGenerateJobActionsContext);
}

export function DocGenerateJobShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [listOpen, setListOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<DocGenerateJob | null>(null);
  const notifiedRef = useMemo(() => new Set<string>(), []);

  const openEditWithContent = useCallback(
    (itemId: string, content: string) => {
      router.push(`/?module=knowledge&editItem=${itemId}&prefill=1`);
      sessionStorage.setItem(`doc-prefill-${itemId}`, content);
    },
    [router],
  );

  const openJobDetail = useCallback(async (jobId: string) => {
    const job = await fetchDocGenerateJob(jobId);
    if (!job) {
      return;
    }
    setDetailJob(job);
    setDetailOpen(true);
    router.push(`/?module=knowledge&jobId=${jobId}`, { scroll: false });
  }, [router]);

  const handleJobFinished = useCallback(
    (job: DocGenerateJob) => {
      if (notifiedRef.has(job.id)) {
        return;
      }
      notifiedRef.add(job.id);

      if (job.status === 'completed') {
        notification.success({
          message: '文档生成完成',
          description: `「${job.itemTitle}」已生成完成。`,
          duration: 0,
          btn: (
            <Space>
              <Button size="small" onClick={() => void openJobDetail(job.id)}>
                查看详情
              </Button>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  if (job.content) {
                    openEditWithContent(job.itemId, job.content);
                  }
                }}
              >
                打开编辑
              </Button>
            </Space>
          ),
        });
        return;
      }

      if (job.status === 'failed' || job.status === 'cancelled') {
        Modal.error({
          title: job.status === 'cancelled' ? '文档生成已取消' : '文档生成失败',
          content: job.errorMessage ?? `「${job.itemTitle}」生成未成功。`,
          okText: '查看详情',
          onOk: () => void openJobDetail(job.id),
        });
      }
    },
    [notifiedRef, openEditWithContent, openJobDetail],
  );

  const { jobs, activeCount, loading, refresh } = useDocGenerateJobPoll({
    onJobFinished: (job) => handleJobFinished(job),
  });

  const actions = useMemo<DocGenerateJobActions>(
    () => ({
      openJobList: () => setListOpen(true),
      openJobDetail: (jobId) => void openJobDetail(jobId),
      openEditWithContent,
      refreshJobs: () => void refresh(),
      jobs,
      activeCount,
    }),
    [activeCount, jobs, openEditWithContent, openJobDetail, refresh],
  );

  return (
    <DocGenerateJobActionsContext.Provider value={actions}>
      {children}
      <DocGenerateJobListModal
        open={listOpen}
        jobs={jobs}
        loading={loading}
        onClose={() => setListOpen(false)}
        onRefresh={() => void refresh()}
        onViewJob={(job) => {
          setDetailJob(job);
          setDetailOpen(true);
        }}
      />
      <DocGenerateJobDetailModal
        open={detailOpen}
        job={detailJob}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => void refresh()}
        onOpenEdit={openEditWithContent}
      />
    </DocGenerateJobActionsContext.Provider>
  );
}
