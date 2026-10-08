// Does a fixed amount of busy work off the main thread, then reports back. Nothing here comes from input but a number of milliseconds.
import { busyWait } from './busy';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ workMs: number }>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => {
  busyWait(e.data.workMs);
  scope.postMessage('done');
};
