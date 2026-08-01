export type RoutingGraphRow = { operation_id: string; work_center_id: string; workstation_id?: string | null; seq: number; predecessor_seq: number | null };

export function validateRoutingOperationGraph(rows: RoutingGraphRow[]): void {
  const sequences = new Set<number>();
  const operationIds = new Set<string>();
  for (const row of rows) {
    if (!row.operation_id || !row.work_center_id || !Number.isInteger(row.seq) || row.seq < 1) throw Object.assign(new Error('ROUTING_OPERATION_FIELDS_INVALID'), { code: 'ROUTING_OPERATION_FIELDS_INVALID' });
    if (sequences.has(row.seq)) throw Object.assign(new Error('ROUTING_SEQUENCE_DUPLICATE'), { code: 'ROUTING_SEQUENCE_DUPLICATE' });
    if (operationIds.has(row.operation_id)) throw Object.assign(new Error('ROUTING_OPERATION_DUPLICATE'), { code: 'ROUTING_OPERATION_DUPLICATE' });
    if (row.predecessor_seq !== null && (!Number.isInteger(row.predecessor_seq) || row.predecessor_seq === row.seq)) throw Object.assign(new Error('ROUTING_PREDECESSOR_INVALID'), { code: 'ROUTING_PREDECESSOR_INVALID' });
    sequences.add(row.seq); operationIds.add(row.operation_id);
  }
  const predecessorBySeq = new Map(rows.map((row) => [row.seq, row.predecessor_seq]));
  for (const row of rows) {
    if (row.predecessor_seq !== null && !sequences.has(row.predecessor_seq)) throw Object.assign(new Error('ROUTING_PREDECESSOR_INVALID'), { code: 'ROUTING_PREDECESSOR_INVALID' });
    const visited = new Set<number>(); let current = row.seq;
    while (predecessorBySeq.get(current) !== null && predecessorBySeq.get(current) !== undefined) {
      if (visited.has(current)) throw Object.assign(new Error('ROUTING_PREDECESSOR_CYCLE'), { code: 'ROUTING_PREDECESSOR_CYCLE' });
      visited.add(current); current = predecessorBySeq.get(current) as number;
    }
  }
}
