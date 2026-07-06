import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasRepos = await knex.schema.hasTable('repos');
  const hasMetadata = await knex.schema.hasTable('repo_metadata');

  if (!hasRepos) {
    await knex.schema.createTable('repos', (table) => {
      table.string('id', 36).primary();
      table.string('url', 512).notNullable();
      table.string('name', 255).notNullable();
      table.enu('auth_type', ['ssh', 'https']).notNullable().defaultTo('https');
      table.json('auth_config').nullable();
      table.string('default_branch', 128).notNullable().defaultTo('main');
      table.json('branch_policy').nullable();
      table
        .enu('connection_status', ['pending', 'connected', 'failed', 'disabled'])
        .notNullable()
        .defaultTo('pending');
      table.text('connection_error').nullable();
      table.json('language_summary').nullable();
      table.timestamp('last_commit_at').nullable();
      table.string('last_commit_summary', 512).nullable();
      table.boolean('enabled').notNullable().defaultTo(true);
      table.boolean('indexed_in_search').notNullable().defaultTo(false);
      table
        .enu('index_status', ['none', 'queued', 'indexing', 'indexed', 'failed', 'removed'])
        .notNullable()
        .defaultTo('none');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.index(['connection_status']);
      table.index(['index_status']);
      table.index(['indexed_in_search']);
    });
  }

  if (!hasMetadata) {
    await knex.schema.createTable('repo_metadata', (table) => {
      table.string('repo_id', 36).primary();
      table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
      table.string('display_name', 50).notNullable();
      // MySQL 不允许 JSON 列设置 DEFAULT；空数组由应用层写入
      table.json('tags').notNullable();
      table.string('business_owner', 255).nullable();
      table.string('tech_owner', 255).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('repo_metadata');
  await knex.schema.dropTableIfExists('repos');
}
