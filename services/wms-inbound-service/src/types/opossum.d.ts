declare module 'opossum' {
  import type { EventEmitter } from 'events';

  export interface Options {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    volumeThreshold?: number;
    name?: string;
    errorFilter?: (error: Error & { statusCode?: number }) => boolean;
  }

  export default class CircuitBreaker<T extends (...args: any[]) => Promise<unknown>> extends EventEmitter {
    constructor(action: T, options?: Options);
    fire(...args: Parameters<T>): ReturnType<T>;
  }
}
