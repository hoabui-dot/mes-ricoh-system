#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import pg from 'pg';

const { Client } = pg;

const mode = process.argv.includes('--reset') ? 'reset' : 'dry-run';
const envName = String(process.env.MES_ENV || '').trim().toLowerCase();
const confirmation = process.env.CONFIRM_MES_FULL_RESET;
const runId = process.env.MES_CANONICAL_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-canonical-reset/${runId}`);

const connections = {
  master: process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db',
  execution: process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db',
  traceability: process.env.MES_TRACEABILITY_DATABASE_URL || 'postgresql://traceability_user:traceability_pass@localhost:15436/mes_traceability_db',
  kiosk: process.env.MES_KIOSK_GATEWAY_DATABASE_URL || process.env.MES_KIOSK_DATABASE_URL || 'postgresql://mes_kiosk_user:mes_kiosk_pass@localhost:15437/mes_kiosk_gateway_db',
};

const expectedDatabases = {
  master: 'mes_master_data_db',
  execution: 'mes_execution_db',
  traceability: 'mes_traceability_db',
  kiosk: 'mes_kiosk_gateway_db',
};

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
const allowedEnvs = new Set(['development', 'test', 'uat', 'local']);
const preserveTables = new Set(['schema_migrations']);

const json = (value) => JSON.stringify(value, null, 2);

function safeIdentity(rawUrl) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.slice(1),
    user: url.username,
    password: '[REDACTED]',
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd: process.cwd(), maxBuffer: 20 * 1024 * 1024 });
  return { command: [command, ...args].join(' '), exit_code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gitContext() {
  try {
    return {
      branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    };
  } catch (error) {
    return { error: error.message };
  }
}

function safetyCheck() {
  const reasons = [];
  if (!allowedEnvs.has(envName)) reasons.push(`MES_ENV must be one of ${[...allowedEnvs].join(', ')}`);
  if (['production', 'prod', 'live'].includes(envName)) reasons.push('MES_ENV must not be production-like');
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') reasons.push('ALLOW_DESTRUCTIVE_SEED must equal true');
  if (process.env.ALLOW_MES_FULL_RESET !== 'true') reasons.push('ALLOW_MES_FULL_RESET must equal true');
  if (mode === 'reset' && confirmation !== 'YES_RESET_ALL_MES_DATA') reasons.push('CONFIRM_MES_FULL_RESET must equal YES_RESET_ALL_MES_DATA');

  const identities = {};
  for (const [name, rawUrl] of Object.entries(connections)) {
    const identity = safeIdentity(rawUrl);
    identities[name] = identity;
    if (!allowedHosts.has(identity.host)) reasons.push(`${name} database host is not approved: ${identity.host}`);
    if (identity.database !== expectedDatabases[name]) reasons.push(`${name} database is not allow-listed: ${identity.database}`);
    if (/prod|production|live/i.test(`${identity.host} ${identity.database}`)) reasons.push(`${name} database identity is production-like`);
  }

  const compose = run('docker', ['compose', 'ls', '--format', 'json']);
  if (compose.exit_code !== 0) reasons.push('current Compose projects cannot be inspected');
  else {
    try {
      const projects = JSON.parse(compose.stdout || '[]');
      const mom = projects.find((project) => project.Name === 'mom-platform');
      if (!mom) reasons.push('mom-platform Compose project is not running or not identifiable');
    } catch {
      reasons.push('docker compose ls did not return parseable JSON');
    }
  }

  return { passed: reasons.length === 0, mode, environment: envName || null, reasons, host: os.hostname(), git: gitContext(), databases: identities };
}

async function ensureDir() {
  await fs.mkdir(artifactDir, { recursive: true });
}

async function writeArtifact(name, value) {
  await fs.writeFile(path.join(artifactDir, name), json(value));
}

async function inspectDatabase(owner, rawUrl) {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const tables = (await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name
    `)).rows.map((row) => row.table_name);
    const foreignKeys = (await client.query(`
      SELECT tc.table_name AS child_table, ccu.table_name AS parent_table,
             kcu.column_name AS child_column, ccu.column_name AS parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.table_name, ccu.table_name
    `)).rows;
    const rowCounts = {};
    const statusDistributions = {};
    for (const table of tables) {
      rowCounts[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
      const columns = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows.map((row) => row.column_name);
      const statusColumn = ['lifecycle_status', 'status', 'runtime_status'].find((column) => columns.includes(column));
      if (statusColumn) {
        statusDistributions[table] = (await client.query(`SELECT "${statusColumn}" AS value, COUNT(*)::int AS count FROM "${table}" GROUP BY "${statusColumn}" ORDER BY "${statusColumn}"`)).rows;
      }
    }
    const targetTables = tables.filter((table) => !preserveTables.has(table));
    return { owner, database: safeIdentity(rawUrl), tables, targetTables, preservedTables: tables.filter((table) => preserveTables.has(table)), rowCounts, statusDistributions, foreignKeys };
  } finally {
    await client.end();
  }
}

function componentRows(inventory) {
  return [
    { component: 'MES Master Data Service', container: 'mes-master-data-service', database_store: 'mes_master_data_db', owner: 'MES Master Data', data_classification: 'Business master data and master-data outbox', reset: 'RESET_REQUIRED', reason: 'Canonical seed rebuilds the disposable MES master data baseline.' },
    { component: 'MES Execution Service', container: 'mes-execution-service', database_store: 'mes_execution_db', owner: 'MES Execution', data_classification: 'Work Orders, snapshots, allocations, read models, print jobs, outbox', reset: 'RESET_REQUIRED', reason: 'Old execution state must not influence UAT flows.' },
    { component: 'MES Traceability Service', container: 'mes-traceability-service', database_store: 'mes_traceability_db', owner: 'MES Traceability', data_classification: 'Traceability policies, labels, genealogy, outbox', reset: 'RESET_REQUIRED', reason: 'Canonical traceability seed is deterministic and disposable.' },
    { component: 'MES Kiosk Gateway Service', container: 'mes-kiosk-gateway-service', database_store: 'mes_kiosk_gateway_db', owner: 'MES Kiosk Gateway', data_classification: 'Terminals, sessions, outbound queue', reset: 'RESET_REQUIRED', reason: 'Disposable MES runtime/session data.' },
    { component: 'Kafka/Schema Registry/Keycloak/Kong/QMS/WMS/Printer Adapter', container: 'platform/shared/non-MES', database_store: 'Shared or non-MES', owner: 'Platform or other bounded context', data_classification: 'Infrastructure or non-MES business data', reset: 'PRESERVE', reason: 'Explicitly outside reset boundary.' },
  ].map((row) => ({ ...row, inspected_databases: Object.keys(inventory) }));
}

async function truncateDatabase(owner, rawUrl, targetTables) {
  if (!targetTables.length) return { owner, truncatedTables: [], deletedRowsBefore: 0 };
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const beforeRows = {};
    for (const table of targetTables) beforeRows[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
    await client.query('BEGIN');
    await client.query(`TRUNCATE TABLE ${targetTables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`);
    const afterRows = {};
    for (const table of targetTables) afterRows[table] = Number((await client.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)).rows[0].count);
    const nonZero = Object.entries(afterRows).filter(([, count]) => count !== 0);
    if (nonZero.length) throw new Error(`${owner} reset left non-zero target rows: ${JSON.stringify(nonZero)}`);
    await client.query('COMMIT');
    return { owner, truncatedTables: targetTables, beforeRows, afterRows, deletedRowsBefore: Object.values(beforeRows).reduce((sum, count) => sum + count, 0) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureDir();
  const safety = safetyCheck();
  await writeArtifact('reset-safety.json', safety);
  if (!safety.passed) throw new Error(`MES_FULL_RESET_SAFETY: ${safety.reasons.join('; ')}`);

  const composePs = run('docker', ['ps', '--filter', 'label=com.docker.compose.project=mom-platform', '--format', '{{json .}}']);
  const composeLs = run('docker', ['compose', 'ls', '--format', 'json']);
  const inventory = {};
  for (const [owner, rawUrl] of Object.entries(connections)) inventory[owner] = await inspectDatabase(owner, rawUrl);
  const preReset = {
    generated_at: new Date().toISOString(),
    mode,
    safety,
    compose: { ls: composeLs, ps: composePs },
    component_boundary: componentRows(inventory),
    databases: inventory,
  };
  await writeArtifact('pre-reset-inventory.json', preReset);

  if (mode !== 'reset') {
    const result = { success: true, mode, artifactDir, dryRun: true, targetedDatabases: Object.keys(connections), resetStarted: false };
    await writeArtifact('reset-result.json', result);
    console.log(json(result));
    return;
  }

  const reset = { success: false, mode, started_at: new Date().toISOString(), databases: {} };
  try {
    for (const [owner, rawUrl] of Object.entries(connections)) {
      reset.databases[owner] = await truncateDatabase(owner, rawUrl, inventory[owner].targetTables);
    }
    reset.success = true;
    reset.completed_at = new Date().toISOString();
    reset.note = 'Only service-owned MES databases were truncated. schema_migrations and non-MES systems were preserved. Kafka topics were not deleted.';
    await writeArtifact('reset-result.json', reset);
    console.log(json(reset));
  } catch (error) {
    reset.error = error.message;
    reset.completed_at = new Date().toISOString();
    await writeArtifact('reset-result.json', reset);
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
