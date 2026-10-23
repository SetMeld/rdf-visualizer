import type { LayoutInput, Positions } from './layout';

export type LayoutJob = { promise: Promise<Positions>; cancel: () => void };

/** Lays the graph out in a worker, so a large layout never freezes the page. One job per worker. */
export function layoutInWorker(input: LayoutInput): LayoutJob {
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  const promise = new Promise<Positions>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Positions>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (event) => {
      reject(new Error(event.message || 'The layout failed.'));
      worker.terminate();
    };
  });
  worker.postMessage(input);
  return { promise, cancel: () => worker.terminate() };
}
