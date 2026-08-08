#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const envName = String(process.env.MES_ENV || 'development').trim().toLowerCase();
const runId = process.env.MES_CANONICAL_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || `artifacts/mes-canonical-reset/${runId}`);
const json = (value) => JSON.stringify(value, null, 2);

const required = [
  ['npm', ['run', 'test:mes:two-line-master-data:phase6'], 'Two-line Master Data lifecycle and readiness gate'],
  ['npm', ['run', 'test:mes:two-line-resource-planning:phase7'], 'Canonical four-state line-selection flow'],
  ['npm', ['run', 'test:mes:two-line-resource-lifecycle:phase8'], 'Selected-line allocation and lifecycle guards'],
  ['npm', ['run', 'test:mes:two-line-full-flow:phase11'], 'Two-line full-flow and failure matrix'],
];

const optionalE2E = [
  ['npm', ['run', 'test:e2e:machine:all'], 'MES Console machine E2E'],
  ['npm', ['run', 'test:e2e:resource-planning:all'], 'MES Console resource-planning E2E'],
  ['npm', ['run', 'test:e2e:resource-planning:phase8'], 'MES Console two-line E2E'],
];

function run(command, args, label, extraEnv = {}) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, MES_ENV: envName, ...extraEnv },
    maxBuffer: 80 * 1024 * 1024,
  });
  return {
    label,
    command: [command, ...args].join(' '),
    exit_code: result.status,
    passed: result.status === 0,
    started_at: started,
    ended_at: new Date().toISOString(),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function writeArtifact(name, value) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, name), json(value));
}

async function main() {
  const includeE2E = process.env.RUN_MES_CANONICAL_E2E === 'true';
  const report = {
    success: false,
    generated_at: new Date().toISOString(),
    environment: envName,
    e2e: includeE2E ? 'enabled' : 'skipped_by_RUN_MES_CANONICAL_E2E',
    command_results: [],
  };
  await writeArtifact('full-flow-result.json', report);

  for (const [command, args, label] of required) {
    const result = run(command, args, label, {
      SKIP_PRINT_STATION_THIRD_PARTY: process.env.SKIP_PRINT_STATION_THIRD_PARTY || 'true',
      SKIP_THIRD_PARTY_INTEGRATIONS: process.env.SKIP_THIRD_PARTY_INTEGRATIONS || 'true',
    });
    report.command_results.push(result);
    await writeArtifact('full-flow-result.json', report);
    if (!result.passed) {
      report.error = `${label} failed`;
      report.completed_at = new Date().toISOString();
      await writeArtifact('full-flow-result.json', report);
      console.error(report.error);
      process.exitCode = 1;
      return;
    }
  }

  if (includeE2E) {
    for (const [command, args, label] of optionalE2E) {
      const result = run(command, args, label);
      report.command_results.push(result);
      await writeArtifact('full-flow-result.json', report);
      if (!result.passed) {
        report.error = `${label} failed`;
        report.completed_at = new Date().toISOString();
        await writeArtifact('full-flow-result.json', report);
        console.error(report.error);
        process.exitCode = 1;
        return;
      }
    }
  }

  const verify = run(process.execPath, ['scripts/verify-mes-canonical-seed.mjs'], 'Post-flow canonical seed readiness verification', { ARTIFACT_DIR: artifactDir });
  report.command_results.push(verify);
  report.success = verify.passed;
  if (!verify.passed) report.error = 'Post-flow canonical seed verification failed';
  report.completed_at = new Date().toISOString();
  await writeArtifact('full-flow-result.json', report);
  console.log(json(report));
  if (!report.success) process.exitCode = 1;
}

main().catch(async (error) => {
  await writeArtifact('full-flow-result.json', { success: false, error: error.message, completed_at: new Date().toISOString() }).catch(() => undefined);
  console.error(error.message);
  process.exitCode = 1;
});
