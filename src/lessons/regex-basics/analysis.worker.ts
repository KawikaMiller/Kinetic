// Runs the learner's pattern off the main thread, so a catastrophically slow one
// (nested repeats like (a+)+ on a long text) can be stopped instead of freezing the page.
import { analyze, type AnalyzeRequest } from './model';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AnalyzeRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = (e) => scope.postMessage(analyze(e.data));
