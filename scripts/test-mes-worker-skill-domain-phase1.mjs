#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const masterUrl = process.env.MES_MASTER_DATA_DATABASE_URL || 'postgresql://mes_master_data_user:mes_master_data_pass@localhost:15434/mes_master_data_db';
const executionUrl = process.env.MES_EXECUTION_DATABASE_URL || 'postgresql://mes_execution_user:mes_execution_pass@localhost:15435/mes_execution_db';
const masterBase = (process.env.MES_MASTER_DATA_URL || 'http://100.68.50.41:18000/api/mes/master-data').replace(/\/$/, '');
const environment = String(process.env.MES_ENV || '').toLowerCase();
const allowMutation = process.env.ALLOW_WORKER_SKILL_DOMAIN_MUTATION === 'true';
const userId = process.env.MES_E2E_USER_ID || '00000000-0000-0000-0000-000000000001';
const roleCode = process.env.MES_E2E_ROLE_CODE || 'PLANT_MANAGER';
const runId = `PHASE1-WORKER-SKILL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const tempCodeSuffix = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const artifactPath = path.resolve(process.env.MES_WORKER_SKILL_PHASE1_OUTPUT || `artifacts/mes-worker-skill-domain/${runId}.json`);
const workerSkillCodes = ['SK-EMP-MIX-MASTER', 'SK-EMP-VULCAN-OPERATOR', 'SK-EMP-INSPECTION'];
const steps = [];
const master = new Client({ connectionString: masterUrl });
const execution = new Client({ connectionString: executionUrl });
let tempWorkCenterSkillId = '';
let tempOperationRequirementCode = '';

function assertSafety() {
  if (!['development', 'local', 'test', 'staging'].includes(environment)) throw new Error('MES_ENV must be development, local, test, or staging.');
  if (!allowMutation) throw new Error('Set ALLOW_WORKER_SKILL_DOMAIN_MUTATION=true to run this focused Worker Skill domain test.');
  for (const rawUrl of [masterUrl, executionUrl]) {
    const host = new URL(rawUrl).hostname;
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Database URL must use a local/test host: ${host}`);
  }
}

async function record(name, fn) {
  const startedAt = new Date().toISOString();
  try {
    const data = await fn();
    steps.push({ name, status: 'passed', started_at: startedAt, finished_at: new Date().toISOString(), data });
    console.log(`[worker-skill] PASS ${name}`);
    return data;
  } catch (error) {
    steps.push({ name, status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: error.message });
    throw error;
  }
}

async function request(requestPath, init = {}, allowed = []) {
  const response = await fetch(`${masterBase}${requestPath}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': userId,
      'X-Role-Code': roleCode,
      'X-Trace-ID': runId,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!response.ok && !allowed.includes(response.status)) throw new Error(`${init.method || 'GET'} ${requestPath} -> ${response.status}: ${JSON.stringify(body)}`);
  return { status: response.status, body: body?.data ?? body };
}

async function ensureTempWorkCenterSkill() {
  const existing = await master.query(`SELECT master_id FROM md_skill WHERE code=$1`, [`TMP-WC-SKILL-${tempCodeSuffix}`]);
  if (existing.rows[0]) return existing.rows[0].master_id;
  const group = await master.query(`
    INSERT INTO md_skill_group (code, name, scope, legacy_flag, lifecycle_status, created_by)
    VALUES ($1, $2::jsonb, 'WorkCenter', FALSE, 'Released', $3)
    ON CONFLICT (code) DO UPDATE SET scope='WorkCenter', lifecycle_status='Released'
    RETURNING skill_group_id`, [`TMP-WC-GROUP-${tempCodeSuffix}`, JSON.stringify({ en: `Temporary WorkCenter skill group ${tempCodeSuffix}`, vi: `Temporary WorkCenter skill group ${tempCodeSuffix}` }), userId]);
  const skill = await master.query(`
    INSERT INTO md_skill (code, name, version_no, lifecycle_status, effective_from, created_by, scope, legacy_flag, skill_group_id, skill_group, minimum_level)
    VALUES ($1, $2::jsonb, 1, 'Released', NOW(), $3, 'WorkCenter', FALSE, $4, 'WorkCenter', 'L1')
    RETURNING master_id`, [`TMP-WC-SKILL-${tempCodeSuffix}`, JSON.stringify({ en: `Temporary WorkCenter skill ${tempCodeSuffix}`, vi: `Temporary WorkCenter skill ${tempCodeSuffix}` }), userId, group.rows[0].skill_group_id]);
  tempWorkCenterSkillId = skill.rows[0].master_id;
  return tempWorkCenterSkillId;
}

async function cleanup() {
  if (tempOperationRequirementCode) {
    await master.query(`DELETE FROM md_operation_skill_requirement WHERE code=$1`, [tempOperationRequirementCode]).catch(() => {});
  }
  if (tempWorkCenterSkillId) {
    await master.query(`DELETE FROM md_skill WHERE master_id=$1`, [tempWorkCenterSkillId]).catch(() => {});
    await master.query(`DELETE FROM md_skill_group WHERE code=$1`, [`TMP-WC-GROUP-${tempCodeSuffix}`]).catch(() => {});
  }
}

async function laborGapCount() {
  const result = await execution.query(`
    SELECT COUNT(*)::int AS count
    FROM rm_operation_skill_requirement r
    WHERE r.mandatory_flag=TRUE
      AND (
        SELECT COUNT(*)::int
        FROM rm_employee e
        JOIN rm_employee_skill es ON es.employee_id=e.master_id AND es.skill_id=r.skill_id
        JOIN rm_employee_shift_schedule sch ON sch.employee_id=e.master_id
        WHERE e.employee_status='Active'
          AND sch.schedule_date=DATE '2026-08-03'
          AND sch.schedule_status='Scheduled'
      ) < r.required_persons`);
  return Number(result.rows[0].count);
}

async function main() {
  assertSafety();
  await master.connect();
  await execution.connect();
  try {
    await record('canonical Worker Skills are Employee scoped and duplicate-free', async () => {
      const rows = (await master.query(`SELECT code, scope, lifecycle_status, legacy_flag FROM md_skill WHERE code = ANY($1::text[]) ORDER BY code`, [workerSkillCodes])).rows;
      if (rows.length !== 3) throw new Error(`Expected 3 canonical Worker Skills, got ${rows.length}`);
      if (rows.some((row) => row.scope !== 'Employee' || row.legacy_flag !== false || row.lifecycle_status !== 'Released')) throw new Error(`Invalid canonical Worker Skill rows: ${JSON.stringify(rows)}`);
      const oldRows = (await master.query(`SELECT code, scope FROM md_skill WHERE code IN ('SK-WC-MIX-MASTER','SK-WC-VULCAN-OPERATOR','SK-WC-INSPECTION')`)).rows;
      if (oldRows.length) throw new Error(`Old WorkCenter-coded worker skills remain active in canonical seed: ${JSON.stringify(oldRows)}`);
      return { rows };
    });

    const canonical = await record('canonical references use Employee scoped Worker Skills', async () => {
      const employeeInvalid = Number((await master.query(`SELECT COUNT(*)::int AS count FROM md_employee_skill es JOIN md_skill s ON s.master_id=es.skill_id WHERE es.active_flag=TRUE AND es.effective_to IS NULL AND s.scope <> 'Employee'`)).rows[0].count);
      const requirementInvalid = Number((await master.query(`SELECT COUNT(*)::int AS count FROM md_operation_skill_requirement r JOIN md_skill s ON s.master_id=r.skill_id WHERE r.active_flag=TRUE AND r.effective_to IS NULL AND s.scope <> 'Employee'`)).rows[0].count);
      if (employeeInvalid || requirementInvalid) throw new Error(`Invalid references employee=${employeeInvalid} requirement=${requirementInvalid}`);
      return { employee_invalid_references: employeeInvalid, operation_requirement_invalid_references: requirementInvalid };
    });

    const workerSkills = await record('Worker Skill API returns Employee scoped definitions', async () => {
      const response = await request('/worker-skills');
      const rows = response.body.filter((row) => workerSkillCodes.includes(row.code));
      if (rows.length !== 3 || rows.some((row) => row.scope !== 'Employee')) throw new Error(`Worker Skill API mismatch: ${JSON.stringify(rows)}`);
      return { count: rows.length, codes: rows.map((row) => row.code) };
    });

    await record('Employee Skill API returns and accepts Employee scoped definitions', async () => {
      const employee = (await master.query(`SELECT master_id FROM md_employee WHERE code='EMP-MIX-001'`)).rows[0];
      const skill = (await master.query(`SELECT master_id FROM md_skill WHERE code='SK-EMP-MIX-MASTER'`)).rows[0];
      const before = await request(`/employees/${employee.master_id}/skills`);
      if (!before.body.some((row) => row.skill_code === 'SK-EMP-MIX-MASTER')) throw new Error(`Employee skill API missing SK-EMP-MIX-MASTER: ${JSON.stringify(before.body)}`);
      const saved = await request(`/employees/${employee.master_id}/skills`, {
        method: 'PUT',
        body: JSON.stringify({ skills: [{ skill_id: skill.master_id, level: 'L3', qualification_status: 'Active' }] }),
      });
      if (saved.status !== 200 || saved.body.length !== 1) throw new Error(`Employee skill save mismatch: ${JSON.stringify(saved)}`);
      return { employee_id: employee.master_id, skill_id: skill.master_id };
    });

    await record('Employee Skill API rejects WorkCenter scoped skill assignment', async () => {
      const employee = (await master.query(`SELECT master_id FROM md_employee WHERE code='EMP-MIX-001'`)).rows[0];
      const tempSkillId = await ensureTempWorkCenterSkill();
      const rejected = await request(`/employees/${employee.master_id}/skills`, {
        method: 'PUT',
        body: JSON.stringify({ skills: [{ skill_id: tempSkillId, level: 'L1', qualification_status: 'Active' }] }),
      }, [422]);
      if (rejected.status !== 422) throw new Error(`Expected 422, got ${rejected.status}`);
      return { status: rejected.status };
    });

    await record('Operation Skill Requirement APIs use Employee scope and reject WorkCenter scope', async () => {
      const routingOperation = (await master.query(`SELECT master_id FROM md_routing_operation WHERE code='RT-FG-WS-CM01-R1-010'`)).rows[0];
      const employeeSkill = (await master.query(`SELECT master_id FROM md_skill WHERE code='SK-EMP-MIX-MASTER'`)).rows[0];
      const tempSkillId = await ensureTempWorkCenterSkill();
      const listed = await request(`/routing-operations/${routingOperation.master_id}/worker-skill-requirements`);
      if (!listed.body.some((row) => row.skill_code === 'SK-EMP-MIX-MASTER' && row.skill_scope === 'Employee')) throw new Error(`Routing operation requirements mismatch: ${JSON.stringify(listed.body)}`);
      const rejected = await request(`/routing-operations/${routingOperation.master_id}/worker-skill-requirements`, {
        method: 'PUT',
        body: JSON.stringify({ requirements: [{ skill_id: tempSkillId, minimum_level: 'L1', required_persons: 1, mandatory_flag: true }] }),
      }, [422]);
      if (rejected.status !== 422) throw new Error(`Expected WorkCenter-scope rejection 422, got ${rejected.status}`);
      const operation = (await master.query(`SELECT master_id FROM md_operation WHERE code='OP-PREP'`)).rows[0];
      tempOperationRequirementCode = `OP-PREP-WSK-${Date.now()}-1`;
      const accepted = await request(`/operations/${operation.master_id}/worker-skill-requirements`, {
        method: 'PUT',
        body: JSON.stringify({ requirements: [{ skill_id: employeeSkill.master_id, minimum_level: 'L3', required_persons: 1, mandatory_flag: true, effective_from: '2026-08-03T00:00:00Z' }] }),
      });
      tempOperationRequirementCode = accepted.body[0]?.code || '';
      if (accepted.status !== 200 || !accepted.body[0]?.master_id) throw new Error(`Expected accepted Employee-scope operation requirement: ${JSON.stringify(accepted)}`);
      const badLevel = await request(`/operations/${operation.master_id}/worker-skill-requirements`, {
        method: 'PUT',
        body: JSON.stringify({ requirements: [{ skill_id: employeeSkill.master_id, minimum_level: 'NOPE', required_persons: 1, mandatory_flag: true }] }),
      }, [422]);
      if (badLevel.status !== 422) throw new Error(`Expected level validation 422, got ${badLevel.status}`);
      return { listed: listed.body.length, rejected_status: rejected.status, accepted_requirement_id: accepted.body[0].master_id };
    });

    await record('Operation Skill Requirement API rejects invalid effectivity', async () => {
      const operation = (await master.query(`SELECT master_id FROM md_operation WHERE code='OP-PREP'`)).rows[0];
      const employeeSkill = (await master.query(`SELECT master_id FROM md_skill WHERE code='SK-EMP-MIX-MASTER'`)).rows[0];
      const rejected = await request(`/operations/${operation.master_id}/worker-skill-requirements`, {
        method: 'PUT',
        body: JSON.stringify({
          requirements: [{
            skill_id: employeeSkill.master_id,
            minimum_level: 'L3',
            required_persons: 1,
            mandatory_flag: true,
            effective_from: '2026-08-03T00:00:00Z',
            effective_to: '2026-08-02T00:00:00Z',
          }],
        }),
      }, [422]);
      if (rejected.status !== 422) throw new Error(`Expected effectivity validation 422, got ${rejected.status}`);
      return { status: rejected.status };
    });

    await record('labor readiness consumes corrected Employee scoped identity', async () => {
      const sufficient = await laborGapCount();
      if (sufficient !== 0) throw new Error(`Expected sufficient labor readiness, got gaps=${sufficient}`);
      await execution.query('BEGIN');
      try {
        const mixSkill = (await execution.query(`SELECT master_id FROM rm_skill WHERE code='SK-EMP-MIX-MASTER'`)).rows[0];
        await execution.query(`DELETE FROM rm_employee_skill WHERE skill_id=$1`, [mixSkill.master_id]);
        const missing = await laborGapCount();
        if (missing < 1) throw new Error(`Expected missing qualification gap, got ${missing}`);
        await execution.query('ROLLBACK');
      } catch (error) {
        await execution.query('ROLLBACK').catch(() => {});
        throw error;
      }
      await execution.query('BEGIN');
      try {
        const vulcanSkill = (await execution.query(`SELECT master_id FROM rm_skill WHERE code='SK-EMP-VULCAN-OPERATOR'`)).rows[0];
        await execution.query(`UPDATE rm_employee_skill SET level='L1' WHERE skill_id=$1`, [vulcanSkill.master_id]);
        const insufficient = Number((await execution.query(`
          SELECT COUNT(*)::int AS count
          FROM rm_operation_skill_requirement r
          WHERE r.skill_id=$1 AND r.minimum_level='L2'
            AND (
              SELECT COUNT(*)::int
              FROM rm_employee_skill es
              WHERE es.skill_id=r.skill_id AND es.level IN ('L2','L3','Expert')
            ) < r.required_persons`, [vulcanSkill.master_id])).rows[0].count);
        if (insufficient < 1) throw new Error(`Expected insufficient level gap, got ${insufficient}`);
        await execution.query('ROLLBACK');
      } catch (error) {
        await execution.query('ROLLBACK').catch(() => {});
        throw error;
      }
      return { sufficient_gaps: sufficient, missing_gap_verified: true, insufficient_level_verified: true };
    });

    const summary = {
      success: true,
      run_id: runId,
      declared: 8,
      executed: steps.length,
      passed: steps.filter((step) => step.status === 'passed').length,
      failed: steps.filter((step) => step.status === 'failed').length,
      skipped: 0,
      canonical,
      workerSkills,
      steps,
      artifact: artifactPath,
    };
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const summary = { success: false, run_id: runId, error: error.stack || error.message, declared: 8, executed: steps.length, passed: steps.filter((step) => step.status === 'passed').length, failed: steps.filter((step) => step.status === 'failed').length + 1, skipped: 0, steps };
    await fs.mkdir(path.dirname(artifactPath), { recursive: true }).catch(() => {});
    await fs.writeFile(artifactPath, JSON.stringify(summary, null, 2)).catch(() => {});
    console.error(`[worker-skill] FAILED: ${error.stack || error.message}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await master.end().catch(() => {});
    await execution.end().catch(() => {});
  }
}

main();
