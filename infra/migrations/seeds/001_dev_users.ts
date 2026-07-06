import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

/** Dev seed — default password: lingprism123 */
const DEV_PASSWORD = 'lingprism123';

export async function seed(knex: Knex): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const users = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@lingprism.local',
      password_hash: passwordHash,
      display_name: '系统管理员',
      role: 'admin',
      team_id: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'employee@lingprism.local',
      password_hash: passwordHash,
      display_name: '普通员工',
      role: 'employee',
      team_id: null,
    },
  ];

  for (const user of users) {
    const existing = await knex('users').where({ email: user.email }).first();
    if (!existing) {
      await knex('users').insert(user);
    }
  }
}
