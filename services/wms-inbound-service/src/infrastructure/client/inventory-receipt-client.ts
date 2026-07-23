import CircuitBreaker from 'opossum';
import { metrics, trace } from '@opentelemetry/api';

export interface InventoryReceiptInput {
  lot_code: string;
  item_revision_id: string;
  location_id: string;
  qty: number;
  uom_code: string;
  expiry_date: string | null;
}

export type ServiceError = Error & { statusCode?: number; code?: string };

const breakerTransitionCounter = metrics
  .getMeter('mom-platform/circuit-breaker')
  .createCounter('circuit_breaker_state_changes_total');

let breakerState = 'closed';

async function postInventoryReceipt(inventoryServiceUrl: string, input: InventoryReceiptInput, userId: string | null): Promise<void> {
  const response = await fetch(`${inventoryServiceUrl}/api/wms/inventory/movements/receipt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(userId ? { 'x-user-id': userId } : {}) },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(`Inventory receipt failed: ${response.status} ${text}`), { statusCode: response.status });
  }
}

function emitBreakerTransition(toState: string): void {
  const fromState = breakerState;
  breakerState = toState;
  const attributes = {
    'circuit_breaker.name': 'WMSInboundInventoryReceipt',
    'circuit_breaker.dependency': 'wms-inventory-service',
    'circuit_breaker.state.from': fromState,
    'circuit_breaker.state.to': toState,
  };
  console.info(`[CircuitBreaker] WMSInboundInventoryReceipt dependency=wms-inventory-service state=${fromState}->${toState}`);
  const tracer = trace.getTracer('mom-platform/circuit-breaker');
  const span = tracer.startSpan('circuit_breaker.state_change', {
    attributes,
  });
  span.addEvent('circuit_breaker.state_change');
  span.end();
  breakerTransitionCounter.add(1, attributes);
}

export function isRetryableInventoryError(error: unknown): boolean {
  const err = error as ServiceError;
  return err?.code === 'EOPENBREAKER'
    || err?.message?.toLowerCase().includes('breaker is open') === true
    || err?.message?.toLowerCase().includes('timed out') === true
    || (typeof err?.statusCode === 'number' && err.statusCode >= 500)
    || (err instanceof Error && typeof err.statusCode !== 'number' && err.code !== undefined);
}

export function createInventoryReceiptClient(inventoryServiceUrl: string) {
  const normalizedUrl = inventoryServiceUrl.replace(/\/$/, '');
  const breaker = new CircuitBreaker(
    (input: InventoryReceiptInput, userId: string | null) => postInventoryReceipt(normalizedUrl, input, userId),
    {
      name: 'WMSInboundInventoryReceipt',
      timeout: 10_000,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
      volumeThreshold: 4,
      errorFilter: (error: ServiceError) => typeof error.statusCode === 'number' && error.statusCode < 500,
    },
  );

  breaker.on('open', () => emitBreakerTransition('open'));
  breaker.on('halfOpen', () => emitBreakerTransition('half-open'));
  breaker.on('close', () => emitBreakerTransition('closed'));

  return {
    async postReceipt(input: InventoryReceiptInput, userId: string | null): Promise<void> {
      await breaker.fire(input, userId).catch((error: ServiceError) => {
        if (isRetryableInventoryError(error)) {
          throw Object.assign(new Error(`Inventory service unavailable: ${error.message}`), { statusCode: 503 });
        }
        throw Object.assign(error, { statusCode: error.statusCode ?? 422 });
      });
    },
  };
}
