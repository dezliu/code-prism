'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

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

type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string };

/** D3 force-directed 架构图 — P0-C */
export function ArchitectureGraph({
  data,
  onNodeClick,
  selectedNodeId,
}: ArchitectureGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scale, setScale] = useState(1);

  const simData = useMemo(() => {
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = data.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
      }));
    return { nodes, links };
  }, [data]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;
    svg.selectAll('*').remove();

    const width = 800;
    const height = 480;
    const g = svg.attr('viewBox', `0 0 ${width} ${height}`).append('g');

    const simulation = d3
      .forceSimulation(simData.nodes)
      .force('link', d3.forceLink(simData.links).id((d) => (d as SimNode).id).distance(120))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(width / 2, height / 2));

    g.append('defs').append('marker')
      .attr('id', 'arrow-d3')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#bfbfbf');

    const link = g.append('g')
      .selectAll('line')
      .data(simData.links)
      .join('line')
      .attr('stroke', '#bfbfbf')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow-d3)');

    const node = g.append('g')
      .selectAll('g')
      .data(simData.nodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_, d) => onNodeClick?.(d));

    node.append('rect')
      .attr('width', 120)
      .attr('height', 40)
      .attr('x', -60)
      .attr('y', -20)
      .attr('rx', 8)
      .attr('fill', (d) => (d.type === 'database' ? '#fff7e6' : d.type === 'module' ? '#f6ffed' : '#e6f4ff'))
      .attr('stroke', (d) => (selectedNodeId === d.id ? '#1677ff' : '#d9d9d9'))
      .attr('stroke-width', (d) => (selectedNodeId === d.id ? 2 : 1));

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('font-size', 12)
      .attr('fill', '#262626')
      .text((d) => d.label);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [simData, onNodeClick, selectedNodeId]);

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setScale((s) => Math.min(s + 0.1, 2))}>放大</button>
        <button type="button" onClick={() => setScale((s) => Math.max(s - 0.1, 0.5))}>缩小</button>
        <button type="button" onClick={() => setScale(1)}>重置</button>
      </div>
      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: 420,
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          background: '#fff',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

export { ArchitectureGraph as GraphCanvas };
