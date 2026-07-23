import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInventoryReceiptClient, type InventoryReceiptInput } from './inventory-receipt-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('inventory receipt circuit breaker', () => {
  it('opens after the minimum failed request volume and stops retry storms', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'inventory unavailable' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    });
    const client = createInventoryReceiptClient('http://wms-inventory-service:3070');
    const input: InventoryReceiptInput = {
      lot_code: 'LOT-001',
      item_revision_id: '11111111-1111-1111-1111-111111111111',
      location_id: '22222222-2222-2222-2222-222222222222',
      qty: 1,
      uom_code: 'PCS',
      expiry_date: null,
    };

    for (let i = 0; i < 5; i += 1) {
      await client.postReceipt(input, 'tester').catch(() => undefined);
    }

    expect(calls).toBe(4);
  });
});
