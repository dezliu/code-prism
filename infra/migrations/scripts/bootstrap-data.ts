/**
 * Import demo/bootstrap dataset for first-run Docker (and local dev).
 *
 * Usage:
 *   npm run bootstrap              # skip if already imported
 *   npm run bootstrap -- --force   # clear demo data and re-import
 *   FORCE_REIMPORT=true npm run bootstrap
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';
import knexConfig from '../knexfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_MARKER_ID = '00000000-0000-4000-8000-0000000000f0';

interface DemoIds {
  repos: string[];
  knowledgeBases: string[];
  knowledgeDocItems: string[];
  qaTemplates: string[];
  alertRules: string[];
  healthScores: string[];
  archDriftRecords: string[];
}

interface DemoDataset {
  version: string;
  datasetKey: string;
  demoIds: DemoIds;
  repos: Record<string, unknown>[];
  repoMetadata: Record<string, unknown>[];
  knowledgeBases: Record<string, unknown>[];
  knowledgeDocItems: Record<string, unknown>[];
  qaTemplates: Record<string, unknown>[];
  alertRules: Record<string, unknown>[];
  healthScores: Record<string, unknown>[];
  archDriftRecords: Record<string, unknown>[];
}

function parseArgs(argv: string[]): { force: boolean } {
  const force =
    argv.includes('--force') ||
    argv.includes('-f') ||
    process.env.FORCE_REIMPORT === 'true' ||
    process.env.FORCE_REIMPORT === '1';
  return { force };
}

function loadDataset(): DemoDataset {
  const datasetPath = path.resolve(__dirname, '../../data/demo/v1.json');
  const raw = readFileSync(datasetPath, 'utf8');
  return JSON.parse(raw) as DemoDataset;
}

function jsonColumn(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function hasBootstrapMarker(db: Knex, datasetKey: string, version: string): Promise<boolean> {
  const tableExists = await db.schema.hasTable('system_bootstrap');
  if (!tableExists) {
    return false;
  }

  const row = await db('system_bootstrap').where({ dataset_key: datasetKey }).first();
  return Boolean(row && row.dataset_version === version);
}

async function clearDemoData(db: Knex, demoIds: DemoIds): Promise<void> {
  if (demoIds.archDriftRecords.length > 0) {
    await db('arch_drift_records').whereIn('id', demoIds.archDriftRecords).del();
  }
  if (demoIds.healthScores.length > 0) {
    await db('health_scores').whereIn('id', demoIds.healthScores).del();
  }
  if (demoIds.alertRules.length > 0) {
    await db('alert_rules').whereIn('id', demoIds.alertRules).del();
  }
  if (demoIds.qaTemplates.length > 0) {
    await db('qa_templates').whereIn('id', demoIds.qaTemplates).del();
  }
  if (demoIds.knowledgeDocItems.length > 0) {
    await db('knowledge_doc_items').whereIn('id', demoIds.knowledgeDocItems).del();
  }
  if (demoIds.knowledgeBases.length > 0) {
    await db('knowledge_bases').whereIn('id', demoIds.knowledgeBases).del();
  }
  if (demoIds.repos.length > 0) {
    await db('repo_metadata').whereIn('repo_id', demoIds.repos).del();
    await db('repos').whereIn('id', demoIds.repos).del();
  }

  const tableExists = await db.schema.hasTable('system_bootstrap');
  if (tableExists) {
    await db('system_bootstrap').where({ id: BOOTSTRAP_MARKER_ID }).del();
  }
}

async function insertIfMissing(
  db: Knex,
  table: string,
  rows: Record<string, unknown>[],
  idColumn = 'id',
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    const id = row[idColumn];
    if (typeof id !== 'string') {
      continue;
    }
    const existing = await db(table).where({ [idColumn]: id }).first();
    if (existing) {
      continue;
    }
    await db(table).insert(row);
    inserted += 1;
  }
  return inserted;
}

function toMysqlDateTime(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim() === '') {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...row };

  if (table === 'repos') {
    if (normalized.last_commit_at != null) {
      normalized.last_commit_at = toMysqlDateTime(normalized.last_commit_at);
    }
    if (normalized.last_synced_at != null) {
      normalized.last_synced_at = toMysqlDateTime(normalized.last_synced_at);
    }
  }

  if (table === 'knowledge_bases' && Array.isArray(row.repo_ids)) {
    normalized.repo_ids = jsonColumn(row.repo_ids);
  }
  if (table === 'repos') {
    if (row.auth_config !== undefined) {
      normalized.auth_config = row.auth_config == null ? null : jsonColumn(row.auth_config);
    }
    if (row.branch_policy !== undefined) {
      normalized.branch_policy = row.branch_policy == null ? null : jsonColumn(row.branch_policy);
    }
    if (row.language_summary !== undefined) {
      normalized.language_summary =
        row.language_summary == null ? null : jsonColumn(row.language_summary);
    }
  }
  if (table === 'repo_metadata' && Array.isArray(row.tags)) {
    normalized.tags = jsonColumn(row.tags);
  }
  if (table === 'qa_templates') {
    normalized.question_types = jsonColumn(row.question_types);
    normalized.keywords = jsonColumn(row.keywords);
    normalized.output_fields = jsonColumn(row.output_fields);
    if (row.applicable_roles != null) {
      normalized.applicable_roles = jsonColumn(row.applicable_roles);
    }
  }
  if (table === 'alert_rules' && Array.isArray(row.notify_channels)) {
    normalized.notify_channels = jsonColumn(row.notify_channels);
  }
  if (table === 'health_scores' && row.metrics != null) {
    normalized.metrics = jsonColumn(row.metrics);
  }

  return normalized;
}

async function importDemoData(db: Knex, dataset: DemoDataset): Promise<number> {
  const tables: Array<{ name: string; rows: Record<string, unknown>[]; idColumn?: string }> = [
    { name: 'repos', rows: dataset.repos },
    { name: 'repo_metadata', rows: dataset.repoMetadata, idColumn: 'repo_id' },
    { name: 'knowledge_bases', rows: dataset.knowledgeBases },
    { name: 'knowledge_doc_items', rows: dataset.knowledgeDocItems },
    { name: 'qa_templates', rows: dataset.qaTemplates },
    { name: 'alert_rules', rows: dataset.alertRules },
    { name: 'health_scores', rows: dataset.healthScores },
    { name: 'arch_drift_records', rows: dataset.archDriftRecords },
  ];

  let totalInserted = 0;
  for (const { name, rows, idColumn } of tables) {
    const normalized = rows.map((row) => normalizeRow(name, row));
    totalInserted += await insertIfMissing(db, name, normalized, idColumn ?? 'id');
  }

  const tableExists = await db.schema.hasTable('system_bootstrap');
  if (tableExists) {
    const markerExists = await db('system_bootstrap')
      .where({ dataset_key: dataset.datasetKey })
      .first();
    if (!markerExists) {
      await db('system_bootstrap').insert({
        id: BOOTSTRAP_MARKER_ID,
        dataset_key: dataset.datasetKey,
        dataset_version: dataset.version,
      });
    }
  }

  return totalInserted;
}

export async function runBootstrap(options: { force?: boolean } = {}): Promise<void> {
  const force = options.force ?? false;
  const dataset = loadDataset();
  const db = knex(knexConfig);

  try {
    const alreadyImported = await hasBootstrapMarker(db, dataset.datasetKey, dataset.version);

    if (alreadyImported && !force) {
      console.log(
        `[bootstrap] Demo dataset "${dataset.datasetKey}" (${dataset.version}) already imported — skipping.`,
      );
      console.log('[bootstrap] Use --force or FORCE_REIMPORT=true to clear and re-import.');
      return;
    }

    if (force) {
      console.log('[bootstrap] FORCE_REIMPORT: clearing demo data…');
      await clearDemoData(db, dataset.demoIds);
    }

    console.log(`[bootstrap] Importing demo dataset "${dataset.datasetKey}" (${dataset.version})…`);
    const inserted = await importDemoData(db, dataset);
    console.log(`[bootstrap] Done. Inserted ${inserted} new row(s).`);
  } finally {
    await db.destroy();
  }
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const { force } = parseArgs(process.argv.slice(2));
  runBootstrap({ force }).catch((err: unknown) => {
    console.error('[bootstrap] Failed:', err);
    process.exit(1);
  });
}
