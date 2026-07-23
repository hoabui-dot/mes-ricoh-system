import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://wms_master_data_user:wms_master_data_pass@localhost:15438/wms_master_data_db',
  },
  strict: true,
  verbose: true,
});
