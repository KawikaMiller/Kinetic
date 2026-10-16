import { Fragment, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';

const WORD = /([A-Za-z_]\w*)/g;

/**
 * An IR listing in a CodePanel. Names the program defines are drawn as marks (buttons when `onSelect` is given, so
 * a learner can pick one and see its definition and uses ringed in --info); lines named by `lineClass` get a class
 * (the hoisted ones draw in --violet).
 */
export function IrCode({
  title, lines, names, selected = null, onSelect, stateOf, lineClass,
}: {
  title: ReactNode;
  lines: readonly string[];
  names: ReadonlySet<string>;
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  stateOf?: (i: number) => LineState;
  lineClass?: (i: number) => string | undefined;
}) {
  const render = (line: string, i: number): ReactNode => (
    <span className={lineClass?.(i)}>
      {line.split(WORD).map((part, k) => {
        if (k % 2 === 0 || !names.has(part)) return <Fragment key={k}>{part}</Fragment>;
        const ring = part === selected ? ' is-ring' : '';
        return onSelect ? (
          <button key={k} type="button" className={`co-name${ring}`} aria-pressed={part === selected} onClick={() => onSelect(part === selected ? null : part)}>
            {part}
          </button>
        ) : (
          <span key={k} className={`co-name${ring}`}>{part}</span>
        );
      })}
    </span>
  );
  return <CodePanel className="co-code" title={title} lines={lines} stateOf={stateOf} renderLine={render} />;
}
