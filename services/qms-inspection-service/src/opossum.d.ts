declare module 'opossum' {
  type Action<T> = (...args: any[]) => Promise<T>;
  interface Options { timeout?: number; errorThresholdPercentage?: number; resetTimeout?: number; volumeThreshold?: number; }
  class CircuitBreaker<T> {
    constructor(action: Action<T>, options?: Options);
    fire(...args: any[]): Promise<T>;
    on(event: string, listener: (...args: any[]) => void): this;
  }
  export default CircuitBreaker;
}
