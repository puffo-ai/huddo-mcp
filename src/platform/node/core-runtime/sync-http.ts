import { receiveMessageOnPort, type MessagePort } from "node:worker_threads";

export type SyncHttpRequest = Readonly<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  timeoutMs: number;
}>;

export type SyncHttpResponse = Readonly<{ status: number; contentType: string; body: Uint8Array }>;

/** Throws when the network is unavailable. */
export type SyncHttp = (request: SyncHttpRequest) => SyncHttpResponse;

type Reply = { ok: SyncHttpResponse } | { error: string };

const WAKE_SLACK_MS = 5_000;

/**
 * The worker side: core's synchronous transport blocks this thread while the host thread fetches. The reply arrives
 * on `port`, which nothing else listens to, and `signal` wakes the worker.
 */
export function syncHttpClient(port: MessagePort, signal: Int32Array): SyncHttp {
  return (request) => {
    Atomics.store(signal, 0, 0);
    port.postMessage(request);
    const deadline = Date.now() + request.timeoutMs + WAKE_SLACK_MS;
    for (;;) {
      const received = receiveMessageOnPort(port);
      if (received) {
        const reply = received.message as Reply;
        if ("error" in reply) throw new Error(reply.error);
        return reply.ok;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`${request.method} ${request.url}: no reply from the host thread`);
      Atomics.wait(signal, 0, 0, Math.min(left, 1_000));
    }
  };
}

/** The host side: fetches for the worker, then wakes it. */
export function serveSyncHttp(port: MessagePort, signal: Int32Array, fetcher: typeof fetch = fetch): void {
  port.on("message", (request: SyncHttpRequest) => {
    void respond(request).then((reply) => {
      port.postMessage(reply);
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0);
    });
  });

  async function respond(request: SyncHttpRequest): Promise<Reply> {
    try {
      const response = await fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body as BodyInit | undefined,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      return {
        ok: {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body: new Uint8Array(await response.arrayBuffer()),
        },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
