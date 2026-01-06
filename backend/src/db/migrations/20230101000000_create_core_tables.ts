import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (knex.client.config.client === 'pg') {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email').notNullable().unique();
    table.string('password', 255).notNullable();
    table.uuid('organization_id').references('id').inTable('organizations');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
  await knex.schema.dropTable('organizations');
}
