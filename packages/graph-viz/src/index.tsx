'use client';

import { useMemo, useState } from 'react';

export interface GraphNode {
  id: string;
  label: string;
  type: 'service' | 'module' | 'database';
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

export interface ArchitectureGraphProps {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  selectedNodeId?: string | null;
}

/** 轻量 SVG 架构图 — Batch 5 P0-C */
export function ArchitectureGraph({
  data,
  onNodeClick,
  selectedNodeId,
}: ArchitectureGraphProps) {
  const [scale, setScale] = useState(1);

  const layout = useMemo(() => {
    const cols = Math.max(2, Math.ceil(Math.sqrt(data.nodes.length)));
    return data.nodes.map((node, index) => ({
      node,
      x: 80 + (index % cols) * 180,
      y: 60 + Math.floor(index / cols) * 100,
    }));
  }, [data.nodes]);

  const nodeMap = new Map(layout.map((item) => [item.node.id, item]));

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setScale((s) => Math.min(s + 0.1, 2))}>
          放大
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(s - 0.1, 0.5))}>
          缩小
        </button>
        <button type="button" onClick={() => setScale(1)}>
          适应画布
        </button>
      </div>
      <svg
        viewBox="0 0 800 480"
        style={{
          width: '100%',
          height: 420,
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          background: '#fff',
        }}
      >
        <g transform={`scale(${scale})`}>
          {data.edges.map((edge) => {
            const from = nodeMap.get(edge.source);
            const to = nodeMap.get(edge.target);
            if (!from || !to) return null;
            return (
              <g key={edge.id}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#bfbfbf"
                  strokeWidth={1.5}
                  markerEnd="url(#arrow)"
                />
                {edge.label ? (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 6}
                    fontSize={10}
                    fill="#8c8c8c"
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {layout.map(({ node, x, y }) => {
            const selected = selectedNodeId === node.id;
            const fill =
              node.type === 'database' ? '#fff7e6' : node.type === 'module' ? '#f6ffed' : '#e6f4ff';
            return (
              <g
                key={node.id}
                transform={`translate(${x - 60}, ${y - 20})`}
                onClick={() => onNodeClick?.(node)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  width={120}
                  height={40}
                  rx={8}
                  fill={fill}
                  stroke={selected ? '#1677ff' : '#d9d9d9'}
                  strokeWidth={selected ? 2 : 1}
                />
                <text x={60} y={24} textAnchor="middle" fontSize={12} fill="#262626">
                  {node.label}
                </text>
              </g>
            );
          })}
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth={6}
              markerHeight={6}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#bfbfbf" />
            </marker>
          </defs>
        </g>
      </svg>
    </div>
  );
}

export { ArchitectureGraph as GraphCanvas };
