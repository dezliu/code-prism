import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('qa_templates', (table) => {
    table.string('id', 36).primary();
    table.string('name', 128).notNullable().unique();
    table.json('question_types').notNullable();
    table.json('keywords').notNullable();
    table.json('output_fields').notNullable();
    table.text('preview_template').notNullable();
    table.json('applicable_roles').nullable();
    table.enu('status', ['enabled', 'disabled']).notNullable().defaultTo('enabled');
    table.integer('priority').notNullable().defaultTo(0);
    table.string('created_by', 36).nullable();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['status']);
    table.index(['priority']);
  });

  await knex.schema.createTable('alert_rules', (table) => {
    table.string('id', 36).primary();
    table.string('name', 128).notNullable();
    table
      .enu('rule_type', ['health_score_min', 'circular_deps_max', 'file_lines_max', 'arch_drift'])
      .notNullable();
    table.enu('scope', ['global', 'team', 'project']).notNullable().defaultTo('global');
    table.string('scope_id', 36).nullable();
    table.decimal('threshold_value', 10, 2).notNullable();
    table.string('threshold_unit', 32).nullable();
    table.json('notify_channels').notNullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.string('created_by', 36).nullable();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['scope', 'scope_id']);
    table.index(['rule_type']);
    table.index(['enabled']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('alert_rules');
  await knex.schema.dropTableIfExists('qa_templates');
}
