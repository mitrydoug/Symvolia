// Typed, promise-based client wrapping the search Web Worker. Each request is
// tagged with a monotonically-increasing id so responses can be matched back to
// their awaiting caller.

import type {
  IndexedStatement,
  SearchMode,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
} from "./types";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class SearchWorkerClient {
  private worker: Worker;
  private nextRequestId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./searchWorker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      const entry = this.pending.get(message.requestId);
      if (!entry) return;
      this.pending.delete(message.requestId);
      if (message.ok) {
        entry.resolve(message.result);
      } else {
        entry.reject(new Error(message.error));
      }
    };
  }

  private send<T>(body: WorkerRequestBody): Promise<T> {
    const requestId = this.nextRequestId++;
    const request: WorkerRequest = { ...body, requestId };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage(request);
    });
  }

  /** Index (or replace) documents for a forum; resolves to the index size. */
  index(
    forumKey: string,
    documents: IndexedStatement[],
    replace: boolean,
  ): Promise<number> {
    return this.send<number>({
      type: "index",
      forumKey,
      documents,
      replace,
    });
  }

  /** Run a search; resolves to matching statement ids (most relevant first). */
  search(
    forumKey: string,
    query: string,
    mode: SearchMode,
    limit: number,
  ): Promise<number[]> {
    return this.send<number[]>({
      type: "search",
      forumKey,
      query,
      mode,
      limit,
    });
  }

  /** Drop a forum index from the worker. */
  clear(forumKey: string): Promise<null> {
    return this.send<null>({ type: "clear", forumKey });
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
