export class DeadlineReached extends Error {
  constructor() {
    super("deadline reached");
  }
}

export class NetworkError extends Error {}

export class Deadline {
  constructor(readonly at: number, readonly signal?: AbortSignal) {}

  remaining(): number {
    return Math.max(0, this.at - Date.now());
  }

  expired(): boolean {
    return this.remaining() === 0 || !!this.signal?.aborted;
  }

  race<T>(work: Promise<T>): Promise<T> {
    work.catch(() => undefined);
    if (this.expired()) return Promise.reject(new DeadlineReached());
    return new Promise<T>((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer);
        this.signal?.removeEventListener("abort", stop);
        reject(new DeadlineReached());
      };
      const timer = setTimeout(stop, this.remaining());
      this.signal?.addEventListener("abort", stop);
      work.then(
        (value) => {
          clearTimeout(timer);
          this.signal?.removeEventListener("abort", stop);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          this.signal?.removeEventListener("abort", stop);
          reject(error);
        },
      );
    });
  }

  async soft<T>(work: Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.race(work);
    } catch {
      return fallback;
    }
  }

  sleep(ms: number): Promise<void> {
    return this.race(new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, this.remaining())))).catch(() => undefined);
  }
}
