import knex, { type Knex } from 'knex';
import { Model } from 'objection';

let knexInstance: Knex | null = null;

export function createKnex(databaseUrl: string): Knex {
  if (knexInstance) {
    return knexInstance;
  }

  knexInstance = knex({
    client: 'mysql2',
    connection: databaseUrl,
    pool: { min: 0, max: 10 },
  });

  Model.knex(knexInstance);
  return knexInstance;
}

export async function destroyKnex(): Promise<void> {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}

export function getKnex(): Knex {
  if (!knexInstance) {
    throw new Error('Knex has not been initialized');
  }
  return knexInstance;
}
