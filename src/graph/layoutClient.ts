import { computeLayout, type LayoutInput, type Positions } from './layout';

export type LayoutJob = { promise: Promise<Positions>; cancel: () => void };

export type CreateLayoutWorker = () => Worker;

const createModuleWorker: CreateLayoutWorker = () =>
  new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });

/**
 * Lays the graph out in a worker, so a large layout never freezes the page. One job per worker. Where
 * no worker can run, as in a sandbox whose content security policy refuses workers, it is laid out on
 * the page instead.
 */
export function layoutInWorker(input: LayoutInput, createWorker: CreateLayoutWorker = createModuleWorker): LayoutJob {
  let cancelled = false;
  const onPage = () =>
    new Promise<Positions>((resolve, reject) => {
      // A turn later, so the page can show that the layout is under way first.
      setTimeout(() => {
        if (cancelled) return;
        try {
          resolve(computeLayout(input));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('The layout failed.'));
        }
      });
    });
  let started: Worker;
  try {
    started = createWorker();
  } catch {
    return { promise: onPage(), cancel: () => (cancelled = true) };
  }
  const promise = new Promise<Positions>((resolve, reject) => {
    started.onmessage = (event: MessageEvent<Positions>) => {
      resolve(event.data);
      started.terminate();
    };
    started.onerror = (event) => {
      event.preventDefault?.();
      started.terminate();
      onPage().then(resolve, reject);
    };
  });
  started.postMessage(input);
  return {
    promise,
    cancel: () => {
      cancelled = true;
      started.terminate();
    },
  };
}
