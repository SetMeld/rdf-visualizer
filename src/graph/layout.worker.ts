import { computeLayout, type LayoutInput } from './layout';

self.onmessage = (event: MessageEvent<LayoutInput>) => {
  self.postMessage(computeLayout(event.data));
};
