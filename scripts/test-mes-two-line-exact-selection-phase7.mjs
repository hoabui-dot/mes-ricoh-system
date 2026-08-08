#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fixtureScript = path.join(repoRoot, 'scripts', 'mes-two-line-uat-fixtures.mjs');
const artifactDir = path.resolve(process.env.MES_TWO_LINE_UAT_DIR || 'artifacts/mes-two-line-uat-phase7-gate');
const environment = {
  ...process.env,
  MES_ENV: process.env.MES_ENV || 'development',
  ALLOW_TWO_LINE_UAT_MUTATION: 'true',
  MES_EXECUTION_URL: process.env.MES_EXECUTION_URL || 'http://localhost:13030/api/mes/execution',
  MES_MASTER_DATA_URL: process.env.MES_MASTER_DATA_URL || 'http://localhost:13020/api/mes/master-data',
  MES_EXECUTION_DATABASE_URL: process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db',
  MES_MASTER_DATA_DATABASE_URL: process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db',
  MES_TWO_LINE_UAT_DIR: artifactDir,
};

function run(mode, { required = true } = {}) {
  const result = spawnSync(process.execPath, [fixtureScript, mode], {
    cwd: repoRoot,
    env: environment,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (required && result.status !== 0) {
    throw new Error(`Two-line Phase 7 ${mode} failed with exit code ${result.status ?? 'unknown'}.`);
  }
  return result.status === 0;
}

let prepared = false;
try {
  run('prepare');
  prepared = true;
  run('verify');
  console.log(JSON.stringify({
    success: true,
    phase: 7,
    gate: 'PASS',
    scenarios: ['primary-ready', 'primary-alternative-ready', 'backup-fallback', 'resource-hold'],
    artifact_dir: artifactDir,
  }, null, 2));
} finally {
  if (prepared) run('cleanup', { required: false });
}
