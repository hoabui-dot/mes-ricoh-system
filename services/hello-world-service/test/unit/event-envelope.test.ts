import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventEnvelope, isEventEnvelope } from '@mom-platform/shared-kernel';

describe('EventEnvelope', () => {
  it('creates a valid envelope with auto-generated fields', () => {
    const envelope = createEventEnvelope({
      event_type: 'Platform.Hello.HelloWorldCreated.v1',
      source_service: 'hello-world-service',
      trace_id: 'test-trace-123',
      payload: { greeting_id: 'uuid-123', message: 'Test' },
    });

    expect(envelope.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(envelope.event_type).toBe('Platform.Hello.HelloWorldCreated.v1');
    expect(envelope.source_service).toBe('hello-world-service');
    expect(envelope.trace_id).toBe('test-trace-123');
    expect(envelope.payload).toEqual({ greeting_id: 'uuid-123', message: 'Test' });
    expect(new Date(envelope.occurred_at).getTime()).not.toBeNaN();
  });

  it('isEventEnvelope returns true for valid envelope', () => {
    const envelope = createEventEnvelope({
      event_type: 'Test.Event.v1',
      source_service: 'test-service',
      trace_id: 'trace-xyz',
      payload: {},
    });
    expect(isEventEnvelope(envelope)).toBe(true);
  });

  it('isEventEnvelope returns false for invalid input', () => {
    expect(isEventEnvelope(null)).toBe(false);
    expect(isEventEnvelope({ event_type: 'only-type' })).toBe(false);
    expect(isEventEnvelope('string')).toBe(false);
  });

  it('each envelope gets a unique event_id', () => {
    const a = createEventEnvelope({ event_type: 'T.v1', source_service: 's', trace_id: 't', payload: {} });
    const b = createEventEnvelope({ event_type: 'T.v1', source_service: 's', trace_id: 't', payload: {} });
    expect(a.event_id).not.toBe(b.event_id);
  });
});
