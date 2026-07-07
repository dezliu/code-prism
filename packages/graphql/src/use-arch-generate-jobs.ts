'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from './constants';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ArchGenerateJob {
  id: string;
  repoId: string;
  repoName: string | null;
  status: string;
  phase: string | null;
  errorMessage: string | null;
  graphData: GraphData | null;
  attemptCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AdminArchitectureItem {
  repoId: string;
  repoName: string | null;
  draft: {
    id: string;
    version: number;
    nodeCount: number;
    updatedAt: string;
  } | null;
  official: {
    id: string;
    version: number;
    versionNote: string | null;
    nodeCount: number;
    publishedAt: string | null;
  } | null;
}

const ADMIN_ARCHITECTURE_FIELDS = `
  repoId
  repoName
  draft { id version nodeCount updatedAt }
  official { id version versionNote nodeCount publishedAt }
`;

export async function addManagedArchitecture(repoId: string): Promise<AdminArchitectureItem> {
  const data = await graphqlRequest<{ addManagedArchitecture: AdminArchitectureItem }>(
    `mutation($repoId: ID!) {
      addManagedArchitecture(repoId: $repoId) {
        ${ADMIN_ARCHITECTURE_FIELDS}
      }
    }`,
    { repoId },
  );
  return data.addManagedArchitecture;
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

const ARCH_JOB_FIELDS = `
  id
  repoId
  repoName
  status
  phase
  errorMessage
  graphData {
    nodes { id label type }
    edges { id source target label }
  }
  attemptCount
  createdAt
  startedAt
  completedAt
`;

export async function fetchArchGenerateJobs(status?: string, limit = 50): Promise<ArchGenerateJob[]> {
  const data = await graphqlRequest<{ archGenerateJobs: ArchGenerateJob[] }>(
    `query($status: String, $limit: Int) {
      archGenerateJobs(status: $status, limit: $limit) {
        ${ARCH_JOB_FIELDS}
      }
    }`,
    { status, limit },
  );
  return data.archGenerateJobs;
}

export async function fetchArchGenerateJob(id: string): Promise<ArchGenerateJob | null> {
  const data = await graphqlRequest<{ archGenerateJob: ArchGenerateJob | null }>(
    `query($id: ID!) {
      archGenerateJob(id: $id) {
        ${ARCH_JOB_FIELDS}
      }
    }`,
    { id },
  );
  return data.archGenerateJob;
}

export async function enqueueArchGenerateJob(repoId: string): Promise<ArchGenerateJob> {
  const data = await graphqlRequest<{ enqueueArchGenerateJob: ArchGenerateJob }>(
    `mutation($repoId: ID!) {
      enqueueArchGenerateJob(repoId: $repoId) {
        ${ARCH_JOB_FIELDS}
      }
    }`,
    { repoId },
  );
  return data.enqueueArchGenerateJob;
}

export async function cancelArchGenerateJob(id: string): Promise<ArchGenerateJob> {
  const data = await graphqlRequest<{ cancelArchGenerateJob: ArchGenerateJob }>(
    `mutation($id: ID!) {
      cancelArchGenerateJob(id: $id) {
        ${ARCH_JOB_FIELDS}
      }
    }`,
    { id },
  );
  return data.cancelArchGenerateJob;
}

const ACTIVE_STATUSES = new Set(['queued', 'running']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export interface UseArchGenerateJobPollOptions {
  enabled?: boolean;
  intervalMs?: number;
  onJobFinished?: (job: ArchGenerateJob, previousStatus: string) => void;
}

export function useArchGenerateJobPoll(options: UseArchGenerateJobPollOptions = {}) {
  const { enabled = true, intervalMs = 3000, onJobFinished } = options;
  const [jobs, setJobs] = useState<ArchGenerateJob[]>([]);
  const [loading, setLoading] = useState(false);
  const statusMapRef = useRef<Map<string, string>>(new Map());
  const onJobFinishedRef = useRef(onJobFinished);

  useEffect(() => {
    onJobFinishedRef.current = onJobFinished;
  }, [onJobFinished]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchArchGenerateJobs(undefined, 50);
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
