import { NotFoundError } from '../../domain/errors.js';
import { MonitorRepository } from '../../infrastructure/db/repositories/monitor.repository.js';
import { RepoRepository } from '../../infrastructure/db/repositories/repo.repository.js';
import type { GraphData } from '../../infrastructure/db/models/graph-snapshot.model.js';

export interface IndexJobSummary {
  id: string;
  repoId: string;
  status: string;
  errorMessage: string | null;
  repoName: string | null;
  createdAt: string;
}

export interface HealthScoreSummary {
  id: string;
  repoId: string;
  score: number;
  metrics: Record<string, unknown>;
  repoName: string | null;
  calculatedAt: string;
}

export interface ArchDriftSummary {
  id: string;
  repoId: string;
  description: string;
  driftType: string;
  sourceNode: string | null;
  targetNode: string | null;
  status: string;
  repoName: string | null;
  detectedAt: string;
}

export interface ArchitectureSummary {
  id: string;
  repoId: string;
  version: number;
  isOfficial: boolean;
  graphData: GraphData;
  versionNote: string | null;
  repoName: string | null;
  publishedAt: string | null;
}

export class ListIndexJobsUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(): Promise<IndexJobSummary[]> {
    const jobs = await this.monitor.listIndexJobs();
    const repoMap = new Map(
      (await this.repos.listAll()).map((r) => [r.id, r.name]),
    );
    return jobs.map((j) => ({
      id: j.id,
      repoId: j.repoId,
      status: j.status,
      errorMessage: j.errorMessage,
      repoName: repoMap.get(j.repoId) ?? null,
      createdAt: j.createdAt.toISOString(),
    }));
  }
}

export class ListHealthScoresUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(): Promise<HealthScoreSummary[]> {
    const scores = await this.monitor.listHealthScores();
    const repoMap = new Map(
      (await this.repos.listAll()).map((r) => [r.id, r.name]),
    );
    return scores.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      score: s.score,
      metrics: s.metrics,
      repoName: repoMap.get(s.repoId) ?? null,
      calculatedAt: s.calculatedAt.toISOString(),
    }));
  }
}

export class ListArchDriftsUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(status?: string): Promise<ArchDriftSummary[]> {
    const drifts = await this.monitor.listArchDrifts(status);
    const repoMap = new Map(
      (await this.repos.listAll()).map((r) => [r.id, r.name]),
    );
    return drifts.map((d) => ({
      id: d.id,
      repoId: d.repoId,
      description: d.description,
      driftType: d.driftType,
      sourceNode: d.sourceNode,
      targetNode: d.targetNode,
      status: d.status,
      repoName: repoMap.get(d.repoId) ?? null,
      detectedAt: d.detectedAt.toISOString(),
    }));
  }
}

export class GetOfficialArchitectureUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(repoId: string): Promise<ArchitectureSummary> {
    const snapshot = await this.monitor.getOfficialArchitecture(repoId);
    if (!snapshot) {
      throw new NotFoundError('OfficialArchitecture', repoId);
    }
    const repo = await this.repos.findById(repoId);
    return {
      id: snapshot.id,
      repoId: snapshot.repoId,
      version: snapshot.version,
      isOfficial: snapshot.isOfficial,
      graphData: snapshot.graphData,
      versionNote: snapshot.versionNote,
      repoName: repo?.name ?? null,
      publishedAt: snapshot.publishedAt?.toISOString() ?? null,
    };
  }
}

export class ListOfficialArchitecturesUseCase {
  constructor(
    private readonly monitor: MonitorRepository,
    private readonly repos: RepoRepository,
  ) {}

  async execute(): Promise<ArchitectureSummary[]> {
    const snapshots = await this.monitor.listOfficialArchitectures();
    const repoMap = new Map(
      (await this.repos.listAll()).map((r) => [r.id, r.name]),
    );
    return snapshots.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      version: s.version,
      isOfficial: s.isOfficial,
      graphData: s.graphData,
      versionNote: s.versionNote,
      repoName: repoMap.get(s.repoId) ?? null,
      publishedAt: s.publishedAt?.toISOString() ?? null,
    }));
  }
}
