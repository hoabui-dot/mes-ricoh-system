import { Client } from 'pg';

const runId = process.argv[2];
const databaseUrl = process.env.MES_MASTER_DATA_DATABASE_URL || process.env.DATABASE_URL;
if (!runId || !/^E2E-MACHINE-[A-Z0-9-]+$/i.test(runId)) throw new Error('A valid E2E-MACHINE run id is required.');
if (!databaseUrl) throw new Error('MES_MASTER_DATA_DATABASE_URL or DATABASE_URL is required for scoped cleanup.');
if (process.env.NODE_ENV === 'production') throw new Error('E2E cleanup is not allowed in production.');

const db = new Client({ connectionString: databaseUrl });
await db.connect();
try {
  await db.query('BEGIN');
  const pattern = `${runId}%`;
  const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
  const machineIds = `(SELECT master_id FROM md_equipment WHERE name->>'vi' LIKE ${sqlLiteral(pattern)})`;
  const unitIds = `(SELECT machine_unit_id FROM md_machine_unit WHERE machine_id IN ${machineIds})`;
  const workstationIds = `(SELECT master_id FROM md_workstation WHERE name->>'vi' LIKE ${sqlLiteral(pattern)})`;
  const groupIds = `(SELECT master_id FROM md_workstation_machine_group WHERE workstation_id IN ${workstationIds})`;
  const counts = {};
  for (const [label, query] of [
    ['resource_assignments', `DELETE FROM md_resource_assignment WHERE equipment_id IN ${machineIds} OR machine_unit_id IN ${unitIds} OR workstation_id IN ${workstationIds} OR machine_group_id IN ${groupIds}`],
    ['resource_capabilities', `DELETE FROM md_resource_capability WHERE equipment_id IN ${machineIds}`],
    ['resource_calendars', `DELETE FROM md_resource_calendar WHERE equipment_id IN ${machineIds}`],
    ['requirements', `DELETE FROM md_workstation_machine_requirement WHERE machine_id IN ${machineIds} OR machine_group_id IN ${groupIds}`],
    ['groups', `DELETE FROM md_workstation_machine_group WHERE master_id IN ${groupIds}`],
    ['workstations', `DELETE FROM md_workstation WHERE master_id IN ${workstationIds}`],
    ['machine_units', `DELETE FROM md_machine_unit WHERE machine_id IN ${machineIds}`],
    ['machines', `DELETE FROM md_equipment WHERE master_id IN ${machineIds}`],
  ]) {
    const result = await db.query(`${query} RETURNING 1`);
    counts[label] = result.rowCount;
  }
  await db.query('COMMIT');
  console.log(JSON.stringify({ runId, result: 'CLEANED', counts }, null, 2));
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
