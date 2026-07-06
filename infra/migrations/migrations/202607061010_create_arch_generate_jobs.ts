import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('arch_generate_jobs');
  if (exists) {
    return;
  }

  await knex.schema.createTable('arch_generate_jobs', (table) => {
    table.string('id', 36).primary();
    table.string('repo_id', 36).notNullable();
    table.foreign('repo_id').references('repos.id').onDelete('CASCADE');
    table
      .enu('status', ['queued', 'running', 'completed', 'failed', 'cancelled'])
      .notNullable()
      .defaultTo('queued');
    table
      .enu('phase', ['fetching_code', 'analyzing', 'generating', 'validating', 'repairing'])
      .nullable();
    table.string('stream_id', 64).notNullable();
    table.string('error_code', 64).nullable();
    table.text('error_message').nullable();
    table.json('graph_data').nullable();
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.string('created_by', 36).nullable();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['status']);
    table.index(['repo_id']);
    table.index(['created_by']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('arch_generate_jobs');
}
