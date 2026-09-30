import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useElementSize } from '../core/hooks';
import { clamp } from '../core/math';

/** Arrow keys move by `step`; with Shift, by this many steps. */
const SHIFT_STEPS = 5;

/**
 * A container whose width the learner drags (or sets with the keyboard) to watch
 * real CSS reflow: box model, flexbox wrapping, media-query breakpoints.
 *
 * - Controlled: `value` is the width in px, clamped to [min, max] by `onChange`.
 * - The handle is a focusable separator: ←/→ move by `step` (Shift ×5), Home/End jump to min/max.
 * - When the stage is narrower than `value`, the pane is shown at the stage's width
 *   and the readout says so, so measurements inside stay honest.
 * - `scaleToFit`: the children are still laid out at the full `value` width (so their media
 *   and container queries see the true width) and then scaled down into the pane, e.g. a
 *   1440px "desktop" page in an 880px stage.
 */
export function ResizablePane({
  min, max, value, onChange, step = 10, label = 'Width', height, scaleToFit = false, children, className = '',
}: {
  min: number;
  max: number;
  value: number;
  onChange: (width: number) => void;
  step?: number;
  label?: string;
  /** Pane height (CSS length); defaults to fitting the content. */
  height?: number | string;
  scaleToFit?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [wrapRef, wrap] = useElementSize<HTMLDivElement>();
  const [fitRef, fit] = useElementSize<HTMLDivElement>();
  const [naturalRef, natural] = useElementSize<HTMLDivElement>();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const shown = wrap.width ? Math.min(value, Math.floor(wrap.width)) : value;
  const scale = fit.width ? Math.min(1, fit.width / value) : 1;
  const set = (w: number) => onChange(clamp(Math.round(w), min, max));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width: shown };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) set(drag.current.width + (e.clientX - drag.current.x));
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? step * SHIFT_STEPS : step;
    const next = { ArrowLeft: value - by, ArrowRight: value + by, Home: min, End: max }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    set(next);
  };

  return (
    <div ref={wrapRef} className={`resizable ${className}`}>
      <div className="resizable-pane" style={{ width: shown, height }}>
        <div className="resizable-content">
          {scaleToFit ? (
            <div ref={fitRef} className="resizable-fit" style={{ height: natural.height * scale }}>
              <div ref={naturalRef} className="resizable-scaled" style={{ width: value, transform: `scale(${scale})` }}>
                {children}
              </div>
            </div>
          ) : (
            children
          )}
        </div>
        <div
          className="resizable-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          <span className="resizable-grip" />
        </div>
      </div>
      <div className="resizable-readout">
        <span className="chip tone-info">
          {label} {value}px
        </span>
        {shown < value &&
          (scaleToFit ? (
            <span className="hint">laid out at a true {value}px, then scaled to fit the stage</span>
          ) : (
            <span className="hint">shown at {shown}px: the stage is narrower</span>
          ))}
      </div>
    </div>
  );
}
