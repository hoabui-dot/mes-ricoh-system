#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const checks = [];
const base = process.env.PRINT_STATION_KIOSK_URL || 'http://127.0.0.1:5007';
const projection = process.env.PRINT_STATION_PROJECTION_URL || 'http://127.0.0.1:5009';
const adapter = process.env.PRINT_STATION_PRINTER_ADAPTER_URL || 'http://100.68.50.41:5003';

async function http(name, url, options = {}, expected = [200]) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    const ok = expected.includes(response.status);
    checks.push({ name, ok, status: response.status, latencyMs: Date.now() - started, endpoint: url, detail: ok ? undefined : body.slice(0, 300) });
  } catch (error) {
    checks.push({ name, ok: false, status: 0, latencyMs: Date.now() - started, endpoint: url, detail: error.message });
  }
}

function command(name, cmd, args) {
  try {
    const output = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    checks.push({ name, ok: true, detail: output.trim().slice(0, 500) });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.stderr?.toString().slice(0, 500) || error.message });
  }
}

await http('kiosk health', `${base}/health`);
await http('projection health', `${projection}/health`);
await http('projection dependency diagnostics', `${projection}/api/projection/diagnostics/health`);
await http('projection dashboard records', `${projection}/api/projection/records/today?page=1&pageSize=10`);
await http('SignalR negotiate', `${projection}/hubs/production/negotiate?negotiateVersion=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
await http('label template adapter endpoint', `${adapter}/api/label-templates/active`, {}, [200, 204]);

command('Docker service health', 'docker', ['ps', '--filter', 'name=station-projection-service', '--filter', 'name=station-kiosk-ui', '--format', '{{.Names}} {{.Status}}']);
command('Kafka required topics', 'docker', ['exec', 'platform-kafka', 'kafka-topics', '--bootstrap-server', 'localhost:9092', '--list']);

const failed = checks.filter((check) => !check.ok);
const report = { generatedAt: new Date().toISOString(), endpoints: { base, projection, adapter }, checks, passed: failed.length === 0 };
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
