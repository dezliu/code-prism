'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';

export interface DocGenerateJob {
  id: string;
  itemId: string;
  itemTitle: string;
  knowledgeBaseId: string;
  knowledgeBaseTitle: string | null;
  title: string;
  docType: string;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  content: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

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

const DOC_GENERATE_JOB_FIELDS = `
  id
  itemId
  itemTitle
  knowledgeBaseId
  knowledgeBaseTitle
  title
  docType
  status
  phase
  errorMessage
  content
  createdAt
  startedAt
  completedAt
`;

export async function fetchDocGenerateJobs(status?: string, limit = 50): Promise<DocGenerateJob[]> {
  const data = await graphqlRequest<{ docGenerateJobs: DocGenerateJob[] }>(
    `query($status: String, $limit: Int) {
      docGenerateJobs(status: $status, limit: $limit) {
        ${DOC_GENERATE_JOB_FIELDS}
      }
    }`,
    { status, limit },
  );
  return data.docGenerateJobs;
}

export async function fetchDocGenerateJob(id: string): Promise<DocGenerateJob | null> {
  const data = await graphqlRequest<{ docGenerateJob: DocGenerateJob | null }>(
    `query($id: ID!) {
      docGenerateJob(id: $id) {
        ${DOC_GENERATE_JOB_FIELDS}
      }
    }`,
    { id },
  );
  return data.docGenerateJob;
}

export async function enqueueDocGenerateJob(input: {
  itemId: string;
  title?: string;
  docType?: string;
}): Promise<DocGenerateJob> {
  const data = await graphqlRequest<{ enqueueDocGenerateJob: DocGenerateJob }>(
    `mutation($input: EnqueueDocGenerateJobInput!) {
      enqueueDocGenerateJob(input: $input) {
        ${DOC_GENERATE_JOB_FIELDS}
      }
    }`,
    { input },
  );
  return data.enqueueDocGenerateJob;
}

export async function cancelDocGenerateJob(id: string): Promise<DocGenerateJob> {
  const data = await graphqlRequest<{ cancelDocGenerateJob: DocGenerateJob }>(
    `mutation($id: ID!) {
      cancelDocGenerateJob(id: $id) {
        ${DOC_GENERATE_JOB_FIELDS}
      }
    }`,
    { id },
  );
  return data.cancelDocGenerateJob;
}

export async function applyDocGenerateJob(id: string): Promise<{ id: string; content?: string }> {
  const data = await graphqlRequest<{ applyDocGenerateJob: { id: string; content?: string } }>(
    `mutation($id: ID!) {
      applyDocGenerateJob(id: $id) {
        id
        content
      }
    }`,
    { id },
  );
  return data.applyDocGenerateJob;
}

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export interface UseDocGenerateJobPollOptions {
  enabled?: boolean;
  intervalMs?: number;
  onJobFinished?: (job: DocGenerateJob, previousStatus: string) => void;
}

export function useDocGenerateJobPoll(options: UseDocGenerateJobPollOptions = {}) {
  const { enabled = true, intervalMs = 3000, onJobFinished } = options;
  const [jobs, setJobs] = useState<DocGenerateJob[]>([]);
  const [loading, setLoading] = useState(false);
  const statusMapRef = useRef<Map<string, string>>(new Map());
  const onJobFinishedRef = useRef(onJobFinished);

  useEffect(() => {
    onJobFinishedRef.current = onJobFinished;
  }, [onJobFinished]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchDocGenerateJobs(undefined, 50);
      setJobs(rows);

      for (const job of rows) {
        const prev = statusMapRef.current.get(job.id);
        if (
          prev &&
          ACTIVE_STATUSES.has(prev) &&
          TERMINAL_STATUSES.has(job.status)
        ) {
          onJobFinishedRef.current?.(job, prev);
        }
        statusMapRef.current.set(job.id, job.status);
      }

      for (const id of [...statusMapRef.current.keys()]) {
        if (!rows.some((job) => job.id === id)) {
          statusMapRef.current.delete(id);
        }
      }
    } finally {
      setLoading(false);
    }
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

  return { jobs, activeCount, loading, refresh };
}
