import type { Knex } from 'knex';

/** 架构图管理登记 — 添加后即出现在管理端列表，与是否已生成快照无关 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('architecture_managed_repos');
  if (exists) {
    return;
  }

  await knex.schema.createTable('architecture_managed_repos', (table) => {
    table.string('repo_id', 36).primary();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['created_at']);
  });

  await knex.raw(`
    INSERT IGNORE INTO architecture_managed_repos (repo_id, created_at)
    SELECT repo_id, MIN(created_at)
    FROM graph_snapshots
    GROUP BY repo_id
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('architecture_managed_repos');
}
