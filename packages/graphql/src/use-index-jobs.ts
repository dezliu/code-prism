'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';

export interface IndexJob {
  id: string;
  repoId: string;
  repoName: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

const INDEX_JOB_FIELDS = `
  id
  repoId
  repoName
  status
  errorMessage
  createdAt
`;

async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'GraphQL 请求失败');
  }

  if (!payload.data) {
    throw new Error('GraphQL 响应为空');
  }

  return payload.data;
}

export async function fetchIndexJobs(): Promise<IndexJob[]> {
  const data = await graphqlRequest<{ indexJobs: IndexJob[] }>(
    `query {
      indexJobs {
        ${INDEX_JOB_FIELDS}
      }
    }`,
  );
  return data.indexJobs;
}

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export interface UseIndexJobPollOptions {
  enabled?: boolean;
  intervalMs?: number;
  onJobFinished?: (job: IndexJob, previousStatus: string) => void;
}

export function useIndexJobPoll(options: UseIndexJobPollOptions = {}) {
  const { enabled = true, intervalMs = 3000, onJobFinished } = options;
  const [jobs, setJobs] = useState<IndexJob[]>([]);
  const [loading, setLoading] = useState(false);
  const statusMapRef = useRef<Map<string, string>>(new Map());
  const onJobFinishedRef = useRef(onJobFinished);

  useEffect(() => {
    onJobFinishedRef.current = onJobFinished;
  }, [onJobFinished]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchIndexJobs();
      setJobs(rows);

      for (const job of rows) {
        const prev = statusMapRef.current.get(job.id);
        if (prev && ACTIVE_STATUSES.has(prev) && TERMINAL_STATUSES.has(job.status)) {
          onJobFinishedRef.current?.(job, prev);
        }
        statusMapRef.current.set(job.id, job.status);
      }

      for (const id of [...statusMapRef.current.keys()]) {
        if (!rows.some((job) => job.id === id)) {
          statusMapRef.current.delete(id);
        }
      }
    } catch {
      // Ignore transient poll failures (e.g. API restart).
    } finally {
      setLoading(false);
    }
  }, []);

  const registerActiveJob = useCallback((jobId: string) => {
    statusMapRef.current.set(jobId, 'queued');
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, refresh]);

  const activeCount = jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).length;

  return { jobs, activeCount, loading, refresh, registerActiveJob };
}
