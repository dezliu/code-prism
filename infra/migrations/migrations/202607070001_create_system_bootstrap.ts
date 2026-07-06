import type { Knex } from 'knex';

/** Tracks one-time demo/bootstrap dataset imports (Docker first-run). */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('system_bootstrap');
  if (exists) {
    return;
  }

  await knex.schema.createTable('system_bootstrap', (table) => {
    table.string('id', 36).primary();
    table.string('dataset_key', 64).notNullable().unique();
    table.string('dataset_version', 32).notNullable();
    table.timestamp('imported_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('system_bootstrap');
}
