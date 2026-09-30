import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** What to show instead of the crashed subtree. `retry` remounts it. */
  fallback: (error: Error, retry: () => void) => ReactNode;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Stops a render error from unmounting everything above it. Wrap anything that
 * can fail on its own (a lesson's Stage) and the app root as a last resort.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Caught by ErrorBoundary:', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children;
  }
}

/** The panel a crashed lesson visual shows; the rest of the lesson page keeps working. */
export function StageCrashed({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="crash-panel" role="alert">
      <h2>This lesson hit an error</h2>
      <p>The visual crashed, but the rest of the page still works. Try reloading it.</p>
      <code>{error.message}</code>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Reload the lesson
      </button>
    </div>
  );
}

/** Last-resort screen when the whole app fails to render. */
export function AppCrashed({ error }: { error: Error }) {
  return (
    <div className="crash-panel crash-app" role="alert">
      <h2>Something went wrong</h2>
      <p>Kinetic hit an unexpected error. Reloading usually fixes it.</p>
      <code>{error.message}</code>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        Reload the page
      </button>
    </div>
  );
}
