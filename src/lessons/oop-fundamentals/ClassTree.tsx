import { RefArrow } from '../../components/memory';
import { SceneNode } from '../../components/scene';
import type { Tone } from '../../core/tone';
import { CLASSES, type ClassName, type Method } from './model';
import { CLASS_AT, CLASS_W, METHOD_H, TITLE_H, classRect } from './treeLayout';

export interface ClassMark {
  tone: Tone;
  variant?: 'default' | 'bad' | 'dim';
  note?: string;
}

/**
 * The Shape → Circle, Rect → Square hierarchy: one box per class listing its own
 * methods, with "extends" arrows to the parent. `mark` highlights a class;
 * `foundMethod` lights the method row that a lookup found.
 */
export function ClassTree({ mark, found }: { mark?: (c: ClassName) => ClassMark | null; found?: { cls: ClassName; method: Method } | null }) {
  return (
    <g className="oo-tree">
      {CLASSES.map((c) =>
        c.parent ? (
          <RefArrow key={`extends-${c.name}`} from={{ x: CLASS_AT[c.name].x, y: classRect(c.name).y }} to={classRect(c.parent)} tone="violet" />
        ) : null,
      )}
      {CLASSES.map((c) => {
        const m = mark?.(c.name) ?? null;
        const r = classRect(c.name);
        return (
          <SceneNode
            key={c.name}
            at={CLASS_AT[c.name]}
            w={CLASS_W}
            h={r.h}
            title={c.name}
            titleDy={-r.h / 2 + 18}
            tone={m?.tone}
            on={!!m && m.variant !== 'bad'}
            variant={m?.variant ?? 'default'}
            className="oo-class"
          >
            {c.own.length === 0 && (
              <text className="oo-method is-none" x={r.x + 12} y={r.y + TITLE_H + 13}>
                (inherits all)
              </text>
            )}
            {c.own.map((method, i) => (
              <text
                key={method}
                className={`oo-method ${found?.cls === c.name && found.method === method ? 'is-found' : ''}`}
                x={r.x + 12}
                y={r.y + TITLE_H + i * METHOD_H + 13}
              >
                {method}()
              </text>
            ))}
            {/* Left of the box: below it would sit on the extends arrow to a subclass. */}
            {m?.note && (
              <text className="oo-note" x={r.x - 10} y={CLASS_AT[c.name].y + 4} textAnchor="end">
                {m.note}
              </text>
            )}
          </SceneNode>
        );
      })}
    </g>
  );
}
