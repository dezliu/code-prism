'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Button, Modal, notification } from 'antd';
import type { IndexJob } from '@lingprism/graphql';
import { useIndexJobPoll } from '@lingprism/graphql';
import { IndexJobListModal, type IndexJobListTab } from './IndexJobListModal';

export interface IndexJobActions {
  openJobList: (tab?: IndexJobListTab) => void;
  refreshJobs: () => void;
  registerActiveJob: (jobId: string) => void;
  jobs: IndexJob[];
  activeCount: number;
}

const IndexJobActionsContext = createContext<IndexJobActions | null>(null);

export function useIndexJobActions(): IndexJobActions | null {
  return useContext(IndexJobActionsContext);
}

export function IndexJobShell({ children }: { children: ReactNode }) {
  const [listOpen, setListOpen] = useState(false);
  const [listTab, setListTab] = useState<IndexJobListTab>('active');
  const notifiedRef = useMemo(() => new Set<string>(), []);

  const openJobList = useCallback((tab: IndexJobListTab = 'active') => {
    setListTab(tab);
    setListOpen(true);
  }, []);

  const handleJobFinished = useCallback(
    (job: IndexJob) => {
      if (notifiedRef.has(job.id)) {
        return;
      }
      notifiedRef.add(job.id);

      const repoLabel = job.repoName ?? job.repoId.slice(0, 8);

      if (job.status === 'completed') {
        notification.success({
          message: '索引同步完成',
          description: `「${repoLabel}」已完成同步索引。`,
          duration: 0,
          btn: (
            <Button size="small" type="primary" onClick={() => openJobList('completed')}>
              查看任务
            </Button>
          ),
        });
        return;
      }

      if (job.status === 'failed' || job.status === 'cancelled') {
        Modal.error({
          title: job.status === 'cancelled' ? '索引任务已取消' : '索引同步失败',
          content: job.errorMessage ?? `「${repoLabel}」同步索引未成功。`,
          okText: '查看任务',
          onOk: () => openJobList('failed'),
        });
      }
    },
    [notifiedRef, openJobList],
  );

  const { jobs, activeCount, loading, refresh, registerActiveJob } = useIndexJobPoll({
    onJobFinished: (job) => handleJobFinished(job),
  });

  const actions = useMemo<IndexJobActions>(
    () => ({
      openJobList,
      refreshJobs: () => void refresh(),
      registerActiveJob,
      jobs,
      activeCount,
    }),
    [activeCount, jobs, openJobList, refresh, registerActiveJob],
  );

  return (
    <IndexJobActionsContext.Provider value={actions}>
      {children}
      <IndexJobListModal
        open={listOpen}
        initialTab={listTab}
        jobs={jobs}
        loading={loading}
        onClose={() => setListOpen(false)}
        onRefresh={() => void refresh()}
      />
    </IndexJobActionsContext.Provider>
  );
}
