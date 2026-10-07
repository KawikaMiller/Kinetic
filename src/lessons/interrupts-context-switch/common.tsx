import { Legend } from '../../components/ui';

/** The Gantt's narrowest readable width; below it, it scrolls sideways on its own. */
export const GANTT_MIN_W = 480;

/** The timeline key every scene shares. */
export function TimelineLegend() {
  return (
    <Legend
      items={[
        { color: 'var(--hi)', label: 'running', shape: 'square' },
        { color: 'var(--violet)', label: 'kernel', shape: 'square' },
        { color: 'var(--muted)', label: 'ready (hatched) / blocked (dashed)', shape: 'square' },
      ]}
    />
  );
}
