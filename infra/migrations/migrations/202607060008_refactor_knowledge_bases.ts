import type { Knex } from 'knex';

/** Normalize legacy repo_ids values (string | array | JSON text) to a string[]. */
export function normalizeRepoIds(raw: unknown): string[] {
  if (raw == null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'object' && raw !== null) {
    try {
      return normalizeRepoIds(JSON.parse(JSON.stringify(raw)));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return normalizeRepoIds(parsed);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return [];
}

export async function up(knex: Knex): Promise<void> {
  const hasBases = await knex.schema.hasTable('knowledge_bases');
  if (!hasBases) {
    await knex.schema.createTable('knowledge_bases', (table) => {
      table.string('id', 36).primary();
      table.string('title', 255).notNullable();
      table.json('repo_ids').notNullable();
      table.string('created_by', 36).nullable();
      table.foreign('created_by').references('users.id').onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['updated_at']);
    });
  }

  const hasItems = await knex.schema.hasTable('knowledge_doc_items');
  if (!hasItems) {
    await knex.schema.createTable('knowledge_doc_items', (table) => {
      table.string('id', 36).primary();
      table.string('knowledge_base_id', 36).notNullable();
      table.foreign('knowledge_base_id').references('knowledge_bases.id').onDelete('CASCADE');
      table.string('title', 255).notNullable();
      table
        .enu('doc_type', ['design', 'adr', 'ops', 'training', 'other'])
        .notNullable()
        .defaultTo('other');
      table.enu('status', ['draft', 'published']).notNullable().defaultTo('draft');
      table.text('content').notNullable();
      table.boolean('indexed_in_search').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['knowledge_base_id']);
      table.index(['status']);
      table.index(['doc_type']);
      table.index(['indexed_in_search']);
    });
  }

  const hasLegacy = await knex.schema.hasTable('knowledge_docs');
  if (hasLegacy) {
    const legacyRows = await knex('knowledge_docs').select('*');
    for (const row of legacyRows) {
      const existingBase = await knex('knowledge_bases').where('id', row.id).first();
      if (existingBase) {
        continue;
      }
      const repoIds = normalizeRepoIds(row.repo_ids);
      await knex('knowledge_bases').insert({
        id: row.id,
        title: row.title,
        repo_ids: JSON.stringify(repoIds),
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
      await knex('knowledge_doc_items').insert({
        id: row.id,
        knowledge_base_id: row.id,
        title: row.title,
        doc_type: row.doc_type,
        status: row.status,
        content: row.content,
        indexed_in_search: row.status === 'published',
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    await knex.schema.renameTable('knowledge_docs', '_deprecated_knowledge_docs');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasDeprecated = await knex.schema.hasTable('_deprecated_knowledge_docs');
  if (hasDeprecated) {
    await knex.schema.renameTable('_deprecated_knowledge_docs', 'knowledge_docs');
  }
  await knex.schema.dropTableIfExists('knowledge_doc_items');
  await knex.schema.dropTableIfExists('knowledge_bases');
}
