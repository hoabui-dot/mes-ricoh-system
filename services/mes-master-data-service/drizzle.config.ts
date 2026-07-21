import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db',
  },
  strict: true,
  verbose: true,
});
