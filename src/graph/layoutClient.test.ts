import { describe, expect, it } from 'vitest';
import type { LayoutInput } from './layout';
import { layoutInWorker } from './layoutClient';

const input: LayoutInput = {
  nodes: [
    { id: 'a', width: 260, height: 80 },
    { id: 'b', width: 260, height: 80 },
  ],
  edges: [{ id: 'ab', source: 'a', target: 'b' }],
  algorithm: 'layered',
};

/** A worker whose script the page's content security policy refused, which reports an error instead of answering. */
class RefusedWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  postMessage() {
    queueMicrotask(() => this.onerror?.({ message: '' } as ErrorEvent));
  }
  terminate() {
    this.terminated = true;
  }
}

describe('layoutInWorker', () => {
  it('lays the graph out on the page when no worker can be created', async () => {
    const positions = await layoutInWorker(input, () => {
      throw new DOMException('Refused to create a worker', 'SecurityError');
    }).promise;
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
    expect(positions.b.x).toBeGreaterThan(positions.a.x);
  });

  it('lays the graph out on the page when the worker fails to start', async () => {
    const worker = new RefusedWorker();
    const positions = await layoutInWorker(input, () => worker as unknown as Worker).promise;
    expect(worker.terminated).toBe(true);
    expect(positions.b.x).toBeGreaterThan(positions.a.x);
  });

  it('uses the worker when it answers', async () => {
    const answer = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    const worker = new RefusedWorker();
    worker.postMessage = () => queueMicrotask(() => worker.onmessage?.({ data: answer } as MessageEvent));
    await expect(layoutInWorker(input, () => worker as unknown as Worker).promise).resolves.toEqual(answer);
  });
});
