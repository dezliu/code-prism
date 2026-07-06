'use client';

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import type { CSSProperties } from 'react';
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
  /** 是否允许拖拽节点调整位置，默认 true */
  draggable?: boolean;
  /** 画布高度（非全屏），默认 480 */
  height?: number;
  /** 是否显示缩放 / 全屏工具栏，默认 true */
  showToolbar?: boolean;
}

type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & { label?: string };

export interface GraphZoomControls {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface GraphToolbarProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

function GraphToolbar({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleFullscreen,
  isFullscreen,
}: GraphToolbarProps) {
  const btnStyle: CSSProperties = {
    padding: '4px 10px',
    fontSize: 13,
    border: '1px solid #d9d9d9',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  };

  return (
    <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" style={btnStyle} onClick={onZoomIn}>放大</button>
      <button type="button" style={btnStyle} onClick={onZoomOut}>缩小</button>
      <button type="button" style={btnStyle} onClick={onReset}>重置视图</button>
      <button type="button" style={btnStyle} onClick={onToggleFullscreen}>
        {isFullscreen ? '退出全屏' : '全屏'}
      </button>
      <span style={{ fontSize: 12, color: '#8c8c8c' }}>
        {Math.round(scale * 100)}% · 空白处拖动平移 · 拖拽节点调整位置
      </span>
    </div>
  );
}

interface GraphSvgProps {
  data: GraphData;
  width: number;
  height: number;
  markerId: string;
  draggable: boolean;
  selectedNodeId?: string | null;
  onNodeClick?: (node: GraphNode) => void;
  onScaleChange?: (scale: number) => void;
  zoomControlsRef: React.MutableRefObject<GraphZoomControls | null>;
}

function GraphSvg({
  data,
  width,
  height,
  markerId,
  draggable,
  selectedNodeId,
  onNodeClick,
  onScaleChange,
  zoomControlsRef,
}: GraphSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onScaleChangeRef = useRef(onScaleChange);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onScaleChangeRef.current = onScaleChange;
  }, [onScaleChange]);

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
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const root = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 2.5])
      .filter((event) => {
        if (event.type === 'wheel') return true;
        const target = event.target as Element;
        return !target.closest('.graph-nodes');
      })
      .on('zoom', (event) => {
        root.attr('transform', event.transform);
        onScaleChangeRef.current?.(event.transform.k);
      });

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('cursor', 'grab')
      .call(zoom)
      .on('dblclick.zoom', null);

    zoomControlsRef.current = {
      zoomIn: () => {
        svg.transition().duration(200).call(zoom.scaleBy, 1.15);
      },
      zoomOut: () => {
        svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.15);
      },
      reset: () => {
        svg.transition().duration(200).call(zoom.transform, d3.zoomIdentity);
      },
    };

    root.append('rect')
      .attr('class', 'graph-bg')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');

    root.append('defs').append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z')
      .attr('fill', '#bfbfbf');

    const simulation = d3
      .forceSimulation(simData.nodes)
      .force('link', d3.forceLink(simData.links).id((d) => (d as SimNode).id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(70))
      .velocityDecay(0.45);

    const link = root.append('g')
      .attr('class', 'graph-links')
      .selectAll('line')
      .data(simData.links)
      .join('line')
      .attr('stroke', '#bfbfbf')
      .attr('stroke-width', 1.5)
      .attr('marker-end', `url(#${markerId})`);

    const node = root.append('g')
      .attr('class', 'graph-nodes')
      .selectAll<SVGGElement, SimNode>('g')
      .data(simData.nodes)
      .join('g')
      .attr('class', 'graph-node')
      .attr('data-node-id', (d) => d.id)
      .style('cursor', draggable ? 'grab' : 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClickRef.current?.(d);
      });

    node.append('rect')
      .attr('class', 'graph-node-rect')
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

    const updatePositions = () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };

    if (draggable) {
      const drag = d3.drag<SVGGElement, SimNode>()
        .on('start', function onDragStart(event, d) {
          event.sourceEvent.stopPropagation();
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          d3.select(this).style('cursor', 'grabbing');
          svg.style('cursor', 'grabbing');
        })
        .on('drag', (event, d) => {
          const t = d3.zoomTransform(svgEl);
          d.fx = (event.x - t.x) / t.k;
          d.fy = (event.y - t.y) / t.k;
        })
        .on('end', function onDragEnd(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          const t = d3.zoomTransform(svgEl);
          d.fx = (event.x - t.x) / t.k;
          d.fy = (event.y - t.y) / t.k;
          d3.select(this).style('cursor', 'grab');
          svg.style('cursor', 'grab');
        });
      node.call(drag);
    }

    simulation.on('tick', updatePositions);

    // 预结算力导向布局，避免管理端弹窗刚打开时节点四散
    simulation.stop();
    for (let i = 0; i < 300; i += 1) simulation.tick();
    updatePositions();
    simulation.alpha(0.15).restart();

    onScaleChangeRef.current?.(1);

    return () => {
      simulation.stop();
      zoomControlsRef.current = null;
    };
  }, [simData, width, height, markerId, draggable, zoomControlsRef]);

  // 选中态仅更新描边，不重建整图仿真
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    d3.select(svgEl)
      .selectAll<SVGRectElement, SimNode>('.graph-node-rect')
      .attr('stroke', (d) => (selectedNodeId === d.id ? '#1677ff' : '#d9d9d9'))
      .attr('stroke-width', (d) => (selectedNodeId === d.id ? 2 : 1));
  }, [selectedNodeId]);

  return (
    <div
      style={{
        width: '100%',
        height,
        overflow: 'hidden',
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        background: '#fff',
      }}
    >
      <svg
        ref={svgRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

/** 管理端 / 用户端统一的默认画布高度 */
export const DEFAULT_ARCHITECTURE_GRAPH_HEIGHT = 480;

/** D3 force-directed 架构图 — 支持画布平移、缩放与节点拖拽 */
export function ArchitectureGraph({
  data,
  onNodeClick,
  selectedNodeId,
  draggable = true,
  height: heightProp = DEFAULT_ARCHITECTURE_GRAPH_HEIGHT,
  showToolbar = true,
}: ArchitectureGraphProps) {
  const reactId = useId();
  const markerId = `arrow-${reactId.replace(/:/g, '')}`;
  const zoomControlsRef = useRef<GraphZoomControls | null>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: heightProp });

  const updateViewport = useCallback(() => {
    if (isFullscreen) {
      setViewport({
        width: Math.max(window.innerWidth - 32, 600),
        height: Math.max(window.innerHeight - 80, 400),
      });
    } else {
      setViewport({ width: 800, height: heightProp });
    }
  }, [isFullscreen, heightProp]);

  useEffect(() => {
    updateViewport();
    if (!isFullscreen) return undefined;
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [isFullscreen, updateViewport]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    setIsFullscreen((v) => !v);
    zoomControlsRef.current?.reset();
    setScale(1);
  };

  const handleZoomIn = () => zoomControlsRef.current?.zoomIn();
  const handleZoomOut = () => zoomControlsRef.current?.zoomOut();
  const handleReset = () => {
    zoomControlsRef.current?.reset();
    setScale(1);
  };

  const graphBody = (
    <>
      {showToolbar && (
        <GraphToolbar
          scale={scale}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
      )}
      <GraphSvg
        data={data}
        width={viewport.width}
        height={viewport.height}
        markerId={markerId}
        draggable={draggable}
        selectedNodeId={selectedNodeId}
        onNodeClick={onNodeClick}
        onScaleChange={setScale}
        zoomControlsRef={zoomControlsRef}
      />
    </>
  );

  if (isFullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1100,
          background: '#f5f5f5',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {graphBody}
      </div>
    );
  }

  return <div>{graphBody}</div>;
}

/**
 * 架构图标准浏览视图（管理端 / 用户端共用）
 * 固定画布尺寸、工具栏缩放、空白处平移、节点拖拽、全屏
 */
export function ArchitectureGraphViewer(props: ArchitectureGraphProps) {
  return (
    <ArchitectureGraph
      draggable
      showToolbar
      height={DEFAULT_ARCHITECTURE_GRAPH_HEIGHT}
      {...props}
    />
  );
}

export { ArchitectureGraph as GraphCanvas };
