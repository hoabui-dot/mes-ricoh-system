import { describe, expect, it } from 'vitest';
import { validateRoutingOperationGraph } from '../../src/infrastructure/http/routing-validation.js';

const row = (seq: number, predecessor_seq: number | null = null, operation_id = `op-${seq}`) => ({ operation_id, work_center_id: 'wc-1', seq, predecessor_seq });

describe('Routing operation replacement validation', () => {
  it('accepts a reordered linear graph', () => {
    expect(() => validateRoutingOperationGraph([row(10), row(20, 10), row(30, 20)])).not.toThrow();
  });
  it('rejects duplicate sequences and operations', () => {
    expect(() => validateRoutingOperationGraph([row(10), row(10, null, 'op-2')])).toThrow('ROUTING_SEQUENCE_DUPLICATE');
    expect(() => validateRoutingOperationGraph([row(10), row(20, 10, 'op-10')])).toThrow('ROUTING_OPERATION_DUPLICATE');
  });
  it('rejects missing predecessors and cycles', () => {
    expect(() => validateRoutingOperationGraph([row(10, 99)])).toThrow('ROUTING_PREDECESSOR_INVALID');
    expect(() => validateRoutingOperationGraph([row(10, 20), row(20, 10)])).toThrow('ROUTING_PREDECESSOR_CYCLE');
  });
});
