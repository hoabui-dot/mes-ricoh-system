#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const woId = process.env.WO_ID;
if (!woId) {
  console.error("WO_ID is required. Refusing to mutate an arbitrary Work Order.");
  process.exit(2);
}

const testMode = "strict-allocation";
if (process.env.TEST_MODE && process.env.TEST_MODE !== testMode) {
  console.error("Work Order physical-print verification only supports strict-allocation.");
  process.exit(2);
}

const base = process.env.MES_EXECUTION_URL || `${process.env.MES_BASE_URL || "http://localhost:18000"}/api/mes/execution`;
const masterDataBase = process.env.MASTER_DATA_BASE_URL || "";
const adapterBase = process.env.PRINTER_ADAPTER_BASE_URL || "";
const remoteAdapter = process.env.PRINTER_ADAPTER_HOST_MODE === "remote" || Boolean(adapterBase);
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const artifactDir = process.env.ARTIFACT_DIR || `artifacts/wo-print-e2e/${stamp}`;
await mkdir(`${artifactDir}/api-responses`, { recursive: true });
for (const dir of ["kafka", "database", "adapter", "cups", "logs", "container-logs"]) await mkdir(`${artifactDir}/${dir}`, { recursive: true });

const responses = {};
const timeline = [];
function mark(stage, status, detail = {}) {
  timeline.push({ at: new Date().toISOString(), stage, status, ...detail });
  console.log(`[${status}] ${stage}${detail.message ? `: ${detail.message}` : ""}`);
}
async function call(name, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-User-ID": process.env.TEST_USER_ID || "00000000-0000-0000-0000-000000000001", "X-Role-Code": process.env.TEST_ROLE_CODE || "PLANT_MANAGER", "X-Trace-ID": `verify-${stamp}`, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  responses[name] = { status: response.status, body };
  await writeFile(`${artifactDir}/api-responses/${name}.json`, JSON.stringify(responses[name], null, 2));
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}: ${text}`);
  return body;
}

async function writeEvidence(name, body) {
  await writeFile(`${artifactDir}/${name}`, typeof body === "string" ? body : JSON.stringify(body, null, 2));
}

async function verifyRunningMode() {
  const expected = "true";
  try {
    const env = execFileSync("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", "mes-execution-service"], { encoding: "utf8" });
    const actual = env.split("\n").find((line) => line.startsWith("MES_RESOURCE_ALLOCATION_APPROVAL_REQUIRED="))?.split("=")[1] || "false";
    await writeEvidence("service-config.json", { testMode, expected, actual, verified: actual === expected });
    if (actual !== expected) throw new Error(`RUNNING_SERVICE_MODE_MISMATCH expected=${expected} actual=${actual}`);
    mark("service configuration", "PASS", { mode: actual });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Cannot verify running service configuration: docker is unavailable");
    }
    throw error;
  }
}

async function completeReadyPredecessors(wo) {
  const quantity = Number(wo.header?.quantity || wo.quantity || 1);
  for (const operation of wo.operations || []) {
    const target = operation.execution_target_type || operation.execution_target || "";
    if (target === "PRINT_STATION" || operation.status === "Finished") continue;
    if (!["Pending", "Ready", "DispatchQueued"].includes(operation.status)) continue;
    try {
      const session = await call(`start-op-${operation.wo_operation_id}`, `/work-orders/${woId}/operations/${operation.wo_operation_id}/start`, {
        method: "POST", body: JSON.stringify({ terminal_ref: process.env.TERMINAL_REF || "KIOSK-E2E-01" }),
      });
      const confirmBody = {
        session_id: session.session_id,
        qty_good: quantity,
        qty_scrap: 0,
        scanned_material_code: process.env.E2E_MATERIAL_CODE || "E2E-MATERIAL",
        idempotency_attempt: `e2e-${operation.wo_operation_id}-1`,
      };
      await call(`confirm-op-${operation.wo_operation_id}`, `/work-orders/${woId}/operations/${operation.wo_operation_id}/confirm`, {
        method: "POST", body: JSON.stringify(confirmBody),
      });
      mark(`predecessor ${operation.sequence_no}`, "PASS", { operationId: operation.wo_operation_id });
    } catch (error) {
      mark(`predecessor ${operation.sequence_no}`, "BLOCKED", { message: error.message });
      break;
    }
  }
}

async function callExternal(name, url) {
  const response = await fetch(url, { headers: { "Accept": "application/json" } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  responses[name] = { status: response.status, body, url };
  await writeFile(`${artifactDir}/api-responses/${name}.json`, JSON.stringify(responses[name], null, 2));
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}: ${text}`);
  return body;
}

const startedAt = new Date().toISOString();
try {
  console.log(`Artifact directory: ${artifactDir}`);
  await writeEvidence("network-report.md", `MES=${process.env.MES_BASE_URL || "http://localhost:18000"}\nAdapter=${adapterBase}\nKafka=${process.env.KAFKA_BOOTSTRAP_SERVERS || "not supplied"}\nCUPS=remote MacOS edge only\n`);
  mark("test mode", "INFO", { mode: testMode });
  await verifyRunningMode();
  if (!adapterBase) throw new Error("PRINTER_ADAPTER_BASE_URL is required; the Adapter is remote and must never default to localhost");
  const adapterHealth = await callExternal("remote-adapter-health", `${adapterBase.replace(/\/$/, "")}/api/health`);
  const activePrinters = await callExternal("remote-adapter-active-printers", `${adapterBase.replace(/\/$/, "")}/api/printers/active`);
  console.log(`Remote Adapter mode=${remoteAdapter}; printer_count=${Array.isArray(activePrinters) ? activePrinters.length : "unknown"}; health=${adapterHealth.status || "unknown"}`);
  if (masterDataBase) {
    await callExternal("master-data-health", `${masterDataBase.replace(/\/$/, "")}/health`);
  }
  await call("compute-check", `/work-orders/${woId}/compute-check`, { method: "POST" });
  await call("approve-wo", `/work-orders/${woId}/approve`, { method: "POST", body: JSON.stringify({ comment: "Strict physical printer E2E verification" }) });
  mark("approval", "PASS", { mode: testMode });
  await call("start-execution", `/work-orders/${woId}/start-execution`, { method: "POST", headers: { "Idempotency-Key": `verify-start-${woId}` }, body: "{}" });
  mark("start execution", "PASS");
  const deadline = Date.now() + Number(process.env.WAIT_SECONDS || 45) * 1000;
  let final;
  while (Date.now() < deadline) {
    final = await call("work-order-latest", `/work-orders/${woId}`);
    await completeReadyPredecessors(final);
    const operations = final.operations || [];
    const print = operations.find((operation) => operation.execution_target_type === "PRINT_STATION" || operation.execution_target === "PRINT_STATION");
    console.log(`WO status=${final.header?.status || final.status}; print=${print?.status || "not-discovered"}`);
    if (print?.resource_allocation?.allocation_id) mark("MES print job allocation", "PASS", { allocationId: print.resource_allocation.allocation_id });
    if (final.header?.status === "Completed" || final.status === "Completed") break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  await writeEvidence("timeline.md", timeline.map((e) => `- ${e.at} ${e.status} ${e.stage} ${e.message || ""}`).join("\n"));
  const operations = final?.operations || [];
  const print = operations.find((operation) => operation.execution_target_type === "PRINT_STATION" || operation.execution_target === "PRINT_STATION");
  const evidence = { success: final?.header?.status === "Completed" || final?.status === "Completed", testMode, woId, startedAt, completedAt: new Date().toISOString(), workOrderCode: final?.header?.wo_code, printOperationId: print?.wo_operation_id, printJobId: print?.print_job_id || print?.resource_allocation?.allocation_id, responses, timeline, printStationCode: process.env.PRINT_STATION_CODE || "PRINT-STATION-01", expectedPrinterCode: process.env.EXPECTED_PRINTER_CODE || "Zebra-GK420t-CUPS", physicalPrintVerified: false, mesOperationCompleted: print?.status === "Finished", workOrderCompleted: final?.header?.status === "Completed" || final?.status === "Completed" };
  await writeFile(`${artifactDir}/summary.json`, JSON.stringify(evidence, null, 2));
  try {
    if (process.env.COLLECT_LOCAL_DOCKER_LOGS === "true") {
      const logs = execFileSync("docker", ["logs", "--since", startedAt, "mes-execution-service"], { encoding: "utf8" });
      await writeFile(`${artifactDir}/container-logs/mes-execution-service.log`, logs.replaceAll(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]"));
    } else {
      await writeFile(`${artifactDir}/container-logs/mes-execution-service.log`, "Skipped: remote-capable verification does not require local Docker access.\n");
    }
  } catch (error) { await writeFile(`${artifactDir}/container-logs/mes-execution-service.log`, `log collection failed: ${error.message}`); }
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  const failureCategory = error.message.includes("RUNNING_SERVICE_MODE") ? "MES_CONFIGURATION" : error.message.includes("WO_RESOURCE_ALLOCATION") ? "WO_APPROVAL" : error.message.includes("CUPS") ? "CUPS_CONNECTIVITY" : "WO_EXECUTION_DISPATCH";
  const failure = { success: false, testMode, woId, startedAt, failedAt: new Date().toISOString(), failedStage: timeline.at(-1)?.stage || "startup", failureCategory, rootCause: error.message, recommendedFix: failureCategory === "WO_APPROVAL" ? "Prepare a valid shift and current committed resource allocation for every Work Order operation." : "Inspect the captured API responses and remote service diagnostics.", error: error.message, responses, timeline };
  await writeFile(`${artifactDir}/summary.json`, JSON.stringify(failure, null, 2));
  await writeEvidence("failure-report.md", `# Failure\n\n- Category: ${failureCategory}\n- Stage: ${failure.failedStage}\n- Root cause: ${error.message}\n- Recommended fix: ${failure.recommendedFix}\n`);
  await writeEvidence("timeline.md", timeline.map((e) => `- ${e.at} ${e.status} ${e.stage} ${e.message || ""}`).join("\n"));
  console.error(error.message);
  process.exitCode = 1;
}
