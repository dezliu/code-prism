import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_messages', (table) => {
    table.json('code_locations').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('chat_messages', (table) => {
    table.dropColumn('code_locations');
  });
}
