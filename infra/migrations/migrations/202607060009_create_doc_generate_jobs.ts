import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('knowledge_doc_generate_jobs');
  if (exists) {
    return;
  }

  await knex.schema.createTable('knowledge_doc_generate_jobs', (table) => {
    table.string('id', 36).primary();
    table.string('item_id', 36).notNullable();
    table
      .foreign('item_id')
      .references('knowledge_doc_items.id')
      .onDelete('CASCADE');
    table.string('knowledge_base_id', 36).notNullable();
    table
      .foreign('knowledge_base_id')
      .references('knowledge_bases.id')
      .onDelete('CASCADE');
    table.string('title', 255).notNullable();
    table
      .enu('doc_type', ['design', 'adr', 'ops', 'training', 'other'])
      .notNullable()
      .defaultTo('other');
    table
      .enu('status', ['queued', 'running', 'completed', 'failed', 'cancelled'])
      .notNullable()
      .defaultTo('queued');
    table
      .enu('phase', ['fetching_code', 'analyzing', 'generating'])
      .nullable();
    table.string('stream_id', 64).notNullable();
    table.string('error_code', 64).nullable();
    table.text('error_message').nullable();
    table.text('content').nullable();
    table.string('created_by', 36).nullable();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['status']);
    table.index(['item_id']);
    table.index(['created_by']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('knowledge_doc_generate_jobs');
}
