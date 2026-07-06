import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('repos', 'local_commit_hash');
  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('repos', (table) => {
    table.string('local_commit_hash', 64).nullable();
    table.string('remote_commit_hash', 64).nullable();
    table.string('indexed_commit_hash', 64).nullable();
    table
      .enu('sync_status', ['synced', 'pending_update', 'syncing', 'failed'])
      .notNullable()
      .defaultTo('synced');
    table.timestamp('last_synced_at').nullable();
    table.index(['sync_status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('repos', 'local_commit_hash');
  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('repos', (table) => {
    table.dropIndex(['sync_status']);
    table.dropColumn('last_synced_at');
    table.dropColumn('sync_status');
    table.dropColumn('indexed_commit_hash');
    table.dropColumn('remote_commit_hash');
    table.dropColumn('local_commit_hash');
  });
}
