export class DeadlineReached extends Error {
  constructor() {
    super("deadline reached");
  }
}

export class NetworkError extends Error {}

export class Deadline {
  private reached = false;

  constructor(readonly at: number, readonly signal?: AbortSignal) {}

  remaining(): number {
    return Math.max(0, this.at - Date.now());
  }

  expired(): boolean {
    return this.reached || this.remaining() === 0 || !!this.signal?.aborted;
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
      const timer = setTimeout(() => {
        this.reached = true;
        stop();
      }, this.remaining());
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
    const left = this.remaining();
    // A sleep cut short by the deadline ends at it. Its timer can beat the race's own one by a moment when the loop's
    // clock lags Date.now() under load, so it marks the deadline reached instead of leaving one more check to run.
    const toDeadline = ms >= left;
    return this.race(new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, Math.min(ms, left))))).then(
      () => {
        if (toDeadline) this.reached = true;
      },
      () => undefined,
    );
  }
}
