import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasAudit = await knex.schema.hasTable('mcp_audit_logs');
  if (!hasAudit) {
    await knex.schema.createTable('mcp_audit_logs', (table) => {
      table.string('id', 36).primary();
      table.string('tool_name', 128).notNullable();
      table.string('api_key_id', 64).nullable();
      table.string('trace_id', 64).nullable();
      table.json('arguments').nullable();
      table.integer('latency_ms').nullable();
      table.string('status', 32).notNullable().defaultTo('ok');
      table.text('error_message').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['tool_name']);
      table.index(['created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mcp_audit_logs');
}
