import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('repos', 'sync_error');
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('repos', (table) => {
    table.text('sync_error').nullable().after('sync_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('repos', 'sync_error');
  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('repos', (table) => {
    table.dropColumn('sync_error');
  });
}
