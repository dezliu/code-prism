'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchCurrentUser, logout, type AuthUser } from '@lingprism/graphql';
import { getAuthToken } from '@lingprism/shared';
import { GRAPHQL_ENDPOINT } from '@lingprism/graphql/constants';
import { MonitorShell, MonitorLiveTime } from '../components/MonitorShell';

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

function HealthTrendChart() {
  return (
    <svg className="monitor-chart-svg" viewBox="0 0 400 180" preserveAspectRatio="none">
      <defs>
        <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(6,182,212,0.2)" />
          <stop offset="100%" stopColor="rgba(6,182,212,0)" />
        </linearGradient>
      </defs>
      <line x1="0" y1="120" x2="400" y2="120" stroke="rgba(239,68,68,0.5)" strokeDasharray="6 4" />
      <polygon
        fill="url(#healthFill)"
        points="0,140 40,130 80,125 120,128 160,118 200,120 240,115 280,118 320,110 360,112 400,108 400,180 0,180"
      />
      <polyline
        fill="none"
        stroke="#06b6d4"
        strokeWidth="2"
        points="0,140 40,130 80,125 120,128 160,118 200,120 240,115 280,118 320,110 360,112 400,108"
      />
    </svg>
  );
}

function RiskBarChart() {
  const bars = [
    { healthy: 8, risk: 1 },
    { healthy: 6, risk: 2 },
    { healthy: 5, risk: 0 },
    { healthy: 7, risk: 1 },
    { healthy: 4, risk: 1 },
  ];
  return (
    <svg className="monitor-chart-svg" viewBox="0 0 200 180">
      {bars.map((b, i) => {
        const x = 20 + i * 36;
        const hHealthy = b.healthy * 12;
        const hRisk = b.risk * 12;
        return (
          <g key={i}>
            <rect x={x} y={160 - hHealthy - hRisk} width={24} height={hHealthy} fill="rgba(16,185,129,0.7)" rx="2" />
            <rect x={x} y={160 - hRisk} width={24} height={hRisk} fill="rgba(239,68,68,0.7)" rx="2" />
          </g>
        );
      })}
    </svg>
  );
}

function CoverageDonut() {
  return (
    <svg className="monitor-chart-svg" viewBox="0 0 200 180">
      <circle cx="100" cy="90" r="60" fill="none" stroke="rgba(51,65,85,0.6)" strokeWidth="16" />
      <circle
        cx="100"
        cy="90"
        r="60"
        fill="none"
        stroke="#8b5cf6"
        strokeWidth="16"
        strokeDasharray="283 377"
        transform="rotate(-90 100 90)"
      />
      <text x="100" y="86" textAnchor="middle" fill="#8b5cf6" fontSize="22" fontWeight="700" fontFamily="JetBrains Mono">
        76%
      </text>
      <text x="100" y="104" textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="Inter">
        覆盖率
      </text>
    </svg>
  );
}

export default function MonitorHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState({ repos: 0, risk: 0, failed: 0, avgHealth: 0 });

  useEffect(() => {
    fetchCurrentUser()
      .then(async (current) => {
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
        const data = await gql<{
          healthScores: Array<{ score: number }>;
          indexJobs: Array<{ status: string }>;
          repos: Array<{ id: string }>;
        }>(`query {
          healthScores { score }
          indexJobs { status }
          repos { id }
        }`);
        const scores = data.healthScores;
        const avg = scores.length
          ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
          : 0;
        setStats({
          repos: data.repos.length,
          risk: scores.filter((s) => s.score < 60).length,
          failed: data.indexJobs.filter((j) => j.status === 'failed').length,
          avgHealth: Math.round(avg * 10) / 10,
        });
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const complianceRate = stats.repos
    ? Math.round(((stats.repos - stats.risk) / stats.repos) * 100)
    : 0;

  return (
    <MonitorShell>
      {stats.failed > 0 ? (
        <a href="/index-status" className="monitor-alert-banner">
          <span className="monitor-alert-icon">⚠</span>
          <div className="monitor-alert-text">
            <strong>索引任务异常</strong> — 当前有 {stats.failed} 个索引任务失败，请检查仓库认证与连接状态。
          </div>
          <span className="monitor-alert-action">查看详情 →</span>
        </a>
      ) : null}

      <div className="monitor-kpi-grid">
        <div className="monitor-kpi-card">
          <div className="monitor-kpi-label">健康度平均分</div>
          <div className="monitor-kpi-value cyan">{stats.avgHealth || '—'}</div>
          <div className="monitor-kpi-meta">{stats.repos} 个纳管项目</div>
        </div>
        <div className="monitor-kpi-card">
          <div className="monitor-kpi-label">架构合规率</div>
          <div className="monitor-kpi-value green">{complianceRate}%</div>
          <div className="monitor-kpi-meta">
            {stats.repos - stats.risk} 合规 · <span className="down">{stats.risk} 存在风险</span>
          </div>
        </div>
        <div className="monitor-kpi-card">
          <div className="monitor-kpi-label">纳管项目</div>
          <div className="monitor-kpi-value purple">{stats.repos}</div>
          <div className="monitor-kpi-meta">全局视图 · 实时同步</div>
        </div>
        <div className="monitor-kpi-card">
          <div className="monitor-kpi-label">索引失败</div>
          <div className="monitor-kpi-value yellow">{stats.failed}</div>
          <div className="monitor-kpi-meta">需及时处理</div>
        </div>
      </div>

      <div className="monitor-charts-grid">
        <div className="monitor-chart-panel">
          <div className="monitor-chart-header">
            <span className="monitor-chart-title">健康度趋势（近 30 天）</span>
            <span className="monitor-chart-badge">全局视图</span>
          </div>
          <div className="monitor-chart-wrap">
            <HealthTrendChart />
          </div>
        </div>
        <div className="monitor-chart-panel">
          <div className="monitor-chart-header">
            <span className="monitor-chart-title">各项目风险分布</span>
            <span className="monitor-chart-badge">按团队</span>
          </div>
          <div className="monitor-chart-wrap">
            <RiskBarChart />
          </div>
        </div>
        <div className="monitor-chart-panel">
          <div className="monitor-chart-header">
            <span className="monitor-chart-title">文档覆盖率</span>
            <span className="monitor-chart-badge">已纳管模块</span>
          </div>
          <div className="monitor-chart-wrap">
            <CoverageDonut />
          </div>
        </div>
      </div>

      <div className="monitor-nav-cards">
        <a href="/health" className="monitor-nav-card">健康度与合规</a>
        <a href="/index-status" className="monitor-nav-card">索引状态</a>
        {user ? (
          <button
            type="button"
            className="monitor-nav-card"
            style={{ cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { logout(); router.replace('/login'); }}
          >
            退出（{user.displayName}）
          </button>
        ) : null}
      </div>

      <div className="monitor-alert-panel">
        <div className="monitor-alert-panel-header">
          <span className="monitor-alert-panel-title">实时预警日志</span>
          <div className="monitor-filter-tabs">
            <span className="monitor-filter-tab active">全部</span>
            <span className="monitor-filter-tab">健康度</span>
            <span className="monitor-filter-tab">架构漂移</span>
            <span className="monitor-filter-tab">索引失败</span>
          </div>
        </div>
        <div className="monitor-alert-log">
          {stats.failed > 0 ? (
            <div className="monitor-alert-row">
              <MonitorLiveTime className="monitor-alert-time" />
              <span className="monitor-severity critical">严重</span>
              <span className="monitor-alert-msg">索引失败：{stats.failed} 个任务未完成</span>
              <span className="monitor-alert-project">indexer</span>
              <span className="monitor-alert-status pending">待处理</span>
            </div>
          ) : null}
          {stats.risk > 0 ? (
            <div className="monitor-alert-row">
              <MonitorLiveTime className="monitor-alert-time" />
              <span className="monitor-severity warning">警告</span>
              <span className="monitor-alert-msg">健康度评分低于阈值 60 的项目共 {stats.risk} 个</span>
              <span className="monitor-alert-project">global</span>
              <span className="monitor-alert-status pending">待处理</span>
            </div>
          ) : null}
          <div className="monitor-alert-row">
            <MonitorLiveTime className="monitor-alert-time" />
            <span className="monitor-severity info">信息</span>
            <span className="monitor-alert-msg">看板数据已同步，纳管项目 {stats.repos} 个</span>
            <span className="monitor-alert-project">lingprism</span>
            <span className="monitor-alert-status resolved">已完成</span>
          </div>
        </div>
      </div>
    </MonitorShell>
  );
}
