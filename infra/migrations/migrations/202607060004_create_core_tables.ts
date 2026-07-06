import type { Knex } from 'knex';

/** Go (core) 写入域 — api 只读展示 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('index_jobs', (table) => {
    table.string('id', 36).primary();
    table.string('repo_id', 36).notNullable();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table
      .enu('status', ['queued', 'running', 'completed', 'failed'])
      .notNullable()
      .defaultTo('queued');
    table.text('error_message').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['repo_id']);
    table.index(['status']);
  });

  await knex.schema.createTable('health_scores', (table) => {
    table.string('id', 36).primary();
    table.string('repo_id', 36).notNullable();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table.integer('score').notNullable();
    table.json('metrics').notNullable();
    table.timestamp('calculated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['repo_id']);
    table.index(['score']);
  });

  await knex.schema.createTable('arch_drift_records', (table) => {
    table.string('id', 36).primary();
    table.string('repo_id', 36).notNullable();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table.text('description').notNullable();
    table.string('drift_type', 64).notNullable();
    table.string('source_node', 255).nullable();
    table.string('target_node', 255).nullable();
    table
      .enu('status', ['open', 'resolved', 'ignored'])
      .notNullable()
      .defaultTo('open');
    table.timestamp('detected_at').notNullable().defaultTo(knex.fn.now());
    table.index(['repo_id']);
    table.index(['status']);
  });

  await knex.schema.createTable('graph_snapshots', (table) => {
    table.string('id', 36).primary();
    table.string('repo_id', 36).notNullable();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table.integer('version').notNullable().defaultTo(1);
    table.boolean('is_official').notNullable().defaultTo(false);
    table.json('graph_data').notNullable();
    table.string('version_note', 512).nullable();
    table.timestamp('published_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['repo_id']);
    table.index(['is_official']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('graph_snapshots');
  await knex.schema.dropTableIfExists('arch_drift_records');
  await knex.schema.dropTableIfExists('health_scores');
  await knex.schema.dropTableIfExists('index_jobs');
}
