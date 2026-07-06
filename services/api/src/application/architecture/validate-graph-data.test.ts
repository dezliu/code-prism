import { describe, expect, it } from 'vitest';
import {
  extractJsonObject,
  parseAndValidateGraphData,
  validateGraphData,
} from './validate-graph-data.js';

const validGraph = {
  nodes: [
    { id: 'api-gateway', label: 'API 网关', type: 'service' },
    { id: 'user-db', label: '用户库', type: 'database' },
  ],
  edges: [
    { id: 'e1', source: 'api-gateway', target: 'user-db', label: 'SQL' },
  ],
};

describe('extractJsonObject', () => {
  it('should extract JSON from markdown fence', () => {
    const raw = '```json\n{"nodes":[],"edges":[]}\n```';
    expect(extractJsonObject(raw)).toBe('{"nodes":[],"edges":[]}');
  });

  it('should extract outer object when surrounded by text', () => {
    const raw = 'Here is the graph:\n{"nodes":[],"edges":[]}\nDone.';
    expect(extractJsonObject(raw)).toBe('{"nodes":[],"edges":[]}');
  });
});

describe('validateGraphData', () => {
  it('should accept valid graph data', () => {
    const result = validateGraphData(validGraph);
    expect(result.ok).toBe(true);
    expect(result.data?.nodes).toHaveLength(2);
  });

  it('should reject empty nodes', () => {
    const result = validateGraphData({ nodes: [], edges: [] });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('NODES_EMPTY');
  });

  it('should reject duplicate node ids', () => {
    const result = validateGraphData({
      nodes: [
        { id: 'svc-a', label: 'A', type: 'service' },
        { id: 'svc-a', label: 'B', type: 'service' },
      ],
      edges: [],
    });
    expect(result.errors.some((e) => e.startsWith('DUPLICATE_NODE_ID'))).toBe(true);
  });

  it('should reject invalid node type', () => {
    const result = validateGraphData({
      nodes: [{ id: 'x', label: 'X', type: 'server' }],
      edges: [],
    });
    expect(result.errors.some((e) => e.startsWith('INVALID_NODE_TYPE'))).toBe(true);
  });

  it('should reject dangling edges', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', label: 'A', type: 'module' }],
      edges: [{ id: 'e1', source: 'a', target: 'missing' }],
    });
    expect(result.errors.some((e) => e.startsWith('DANGLING_EDGE'))).toBe(true);
  });

  it('should reject too many nodes', () => {
    const nodes = Array.from({ length: 31 }, (_, i) => ({
      id: `n-${i}`,
      label: `N${i}`,
      type: 'module' as const,
    }));
    const result = validateGraphData({ nodes, edges: [] });
    expect(result.errors.some((e) => e.startsWith('TOO_MANY_NODES'))).toBe(true);
  });
});

describe('parseAndValidateGraphData', () => {
  it('should parse fenced JSON and validate', () => {
    const raw = `\`\`\`json\n${JSON.stringify(validGraph)}\n\`\`\``;
    const result = parseAndValidateGraphData(raw);
    expect(result.ok).toBe(true);
  });

  it('should return parse error for invalid JSON', () => {
    const result = parseAndValidateGraphData('{not json');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/^JSON_PARSE_ERROR/);
  });
});
