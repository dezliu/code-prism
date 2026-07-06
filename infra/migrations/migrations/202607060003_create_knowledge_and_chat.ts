import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('knowledge_docs', (table) => {
    table.string('id', 36).primary();
    table.string('title', 255).notNullable();
    table
      .enu('doc_type', ['design', 'adr', 'ops', 'training', 'other'])
      .notNullable()
      .defaultTo('other');
    table.enu('status', ['draft', 'published']).notNullable().defaultTo('draft');
    // MySQL 不允许 TEXT/JSON 列设置 DEFAULT；默认值由应用层写入
    table.text('content').notNullable();
    table.json('repo_ids').notNullable();
    table.string('created_by', 36).nullable();
    table.foreign('created_by').references('users.id').onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['status']);
    table.index(['doc_type']);
  });

  await knex.schema.createTable('chat_sessions', (table) => {
    table.string('id', 36).primary();
    table.string('user_id', 36).notNullable();
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.string('title', 255).notNullable().defaultTo('新会话');
    table.json('anchor').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id']);
  });

  await knex.schema.createTable('chat_messages', (table) => {
    table.string('id', 36).primary();
    table.string('session_id', 36).notNullable();
    table.foreign('session_id').references('chat_sessions.id').onDelete('CASCADE');
    table.enu('role', ['user', 'assistant']).notNullable();
    table.text('content').notNullable();
    table.json('sources').nullable();
    table.boolean('interrupted').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['session_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_sessions');
  await knex.schema.dropTableIfExists('knowledge_docs');
}
