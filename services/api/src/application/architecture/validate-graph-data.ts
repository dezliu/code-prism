import type { GraphData, GraphNode } from '../../infrastructure/db/models/graph-snapshot.model.js';

export interface GraphValidationResult {
  ok: boolean;
  data?: GraphData;
  errors: string[];
}

export interface GraphValidationLimits {
  maxNodes?: number;
  maxEdges?: number;
}

const NODE_TYPES = new Set(['service', 'module', 'database']);

const DEFAULT_LIMITS: Required<GraphValidationLimits> = {
  maxNodes: 30,
  maxEdges: 40,
};

/** Strip markdown code fences and extract the outermost JSON object. */
export function extractJsonObject(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fenceMatch) {
    text = fenceMatch[1]!.trim();
  } else if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

export function parseGraphJson(raw: string): { data: unknown; errors: string[] } {
  const jsonText = extractJsonObject(raw);
  try {
    return { data: JSON.parse(jsonText) as unknown, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return { data: null, errors: [`JSON_PARSE_ERROR: ${message}`] };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateGraphData(
  input: unknown,
  limits: GraphValidationLimits = {},
): GraphValidationResult {
  const { maxNodes, maxEdges } = { ...DEFAULT_LIMITS, ...limits };
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['INVALID_ROOT: expected object with nodes and edges'] };
  }

  const record = input as Record<string, unknown>;
  const nodesRaw = record.nodes;
  const edgesRaw = record.edges;

  if (!Array.isArray(nodesRaw)) {
    return { ok: false, errors: ['INVALID_NODES: nodes must be an array'] };
  }
  if (!Array.isArray(edgesRaw)) {
    return { ok: false, errors: ['INVALID_EDGES: edges must be an array'] };
  }
  if (nodesRaw.length === 0) {
    return { ok: false, errors: ['NODES_EMPTY'] };
  }
  if (nodesRaw.length > maxNodes) {
    errors.push(`TOO_MANY_NODES: ${nodesRaw.length} > ${maxNodes}`);
  }
  if (edgesRaw.length > maxEdges) {
    errors.push(`TOO_MANY_EDGES: ${edgesRaw.length} > ${maxEdges}`);
  }

  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();

  for (let i = 0; i < nodesRaw.length; i += 1) {
    const node = nodesRaw[i];
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      errors.push(`INVALID_NODE_FIELD: nodes[${i}] must be an object`);
      continue;
    }
    const n = node as Record<string, unknown>;
    if (!isNonEmptyString(n.id) || !isNonEmptyString(n.label)) {
      errors.push(`INVALID_NODE_FIELD: nodes[${i}] id and label are required`);
      continue;
    }
    if (!isNonEmptyString(n.type) || !NODE_TYPES.has(n.type)) {
      errors.push(`INVALID_NODE_TYPE: nodes[${i}] id=${String(n.id)} type=${String(n.type)}`);
      continue;
    }
    if (nodeIds.has(n.id)) {
      errors.push(`DUPLICATE_NODE_ID: ${n.id}`);
      continue;
    }
    nodeIds.add(n.id);
    const parsed: GraphNode = {
      id: n.id.trim(),
      label: n.label.trim(),
      type: n.type as GraphNode['type'],
    };
    if (n.metadata !== undefined) {
      if (typeof n.metadata !== 'object' || n.metadata === null || Array.isArray(n.metadata)) {
        errors.push(`INVALID_NODE_METADATA: nodes[${i}] id=${n.id}`);
      } else {
        parsed.metadata = n.metadata as Record<string, unknown>;
      }
    }
    nodes.push(parsed);
  }

  const edgeIds = new Set<string>();
  const edges: GraphData['edges'] = [];

  for (let i = 0; i < edgesRaw.length; i += 1) {
    const edge = edgesRaw[i];
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      errors.push(`INVALID_EDGE_FIELD: edges[${i}] must be an object`);
      continue;
    }
    const e = edge as Record<string, unknown>;
    if (!isNonEmptyString(e.id) || !isNonEmptyString(e.source) || !isNonEmptyString(e.target)) {
      errors.push(`INVALID_EDGE_FIELD: edges[${i}] id, source, target are required`);
      continue;
    }
    if (edgeIds.has(e.id)) {
      errors.push(`DUPLICATE_EDGE_ID: ${e.id}`);
    } else {
      edgeIds.add(e.id);
    }
    if (!nodeIds.has(e.source)) {
      errors.push(`DANGLING_EDGE: ${e.id} source=${e.source}`);
    }
    if (!nodeIds.has(e.target)) {
      errors.push(`DANGLING_EDGE: ${e.id} target=${e.target}`);
    }
    const parsedEdge: GraphData['edges'][number] = {
      id: e.id.trim(),
      source: e.source.trim(),
      target: e.target.trim(),
    };
    if (e.label !== undefined) {
      if (typeof e.label !== 'string') {
        errors.push(`INVALID_EDGE_LABEL: edges[${i}] id=${e.id}`);
      } else {
        parsedEdge.label = e.label;
      }
    }
    edges.push(parsedEdge);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: { nodes, edges },
    errors: [],
  };
}

export function parseAndValidateGraphData(
  raw: string,
  limits?: GraphValidationLimits,
): GraphValidationResult {
  const { data, errors: parseErrors } = parseGraphJson(raw);
  if (parseErrors.length > 0) {
    return { ok: false, errors: parseErrors };
  }
  return validateGraphData(data, limits);
}
