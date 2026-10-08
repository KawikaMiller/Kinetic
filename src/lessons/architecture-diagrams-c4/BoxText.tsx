import type { ReactNode } from 'react';
import type { Pt } from '../../core/geometry';
import { KIND_LABEL } from './kinds';
import { BOX } from './layout';
import type { Kind } from './model';

const NAME_DY = -4;
const SUB_DY = 13;
/** The + badge sits on the box's top-right corner. */
const PLUS_R = 9;

/** Name and second line inside a box, plus the + that marks a box you can zoom into. */
export function BoxText({ at, name, tech, kind, zoomable }: { at: Pt; name: string; tech?: string | null; kind?: Kind | null; zoomable?: boolean }): ReactNode {
  const second = tech ? { text: tech, cls: 'c4-tech' } : kind ? { text: `[${KIND_LABEL[kind]}]`, cls: 'c4-kind' } : null;
  return (
    <>
      <text x={at.x} y={at.y + (second ? NAME_DY : 5)} textAnchor="middle" className="c4-name">
        {name}
      </text>
      {second && (
        <text x={at.x} y={at.y + SUB_DY} textAnchor="middle" className={second.cls}>
          {second.text}
        </text>
      )}
      {zoomable && (
        <g className="c4-plus-badge">
          <circle cx={at.x + BOX.w / 2} cy={at.y - BOX.h / 2} r={PLUS_R} className="c4-plus-dot" />
          <text x={at.x + BOX.w / 2} y={at.y - BOX.h / 2} textAnchor="middle" dominantBaseline="central" className="c4-plus">
            +
          </text>
        </g>
      )}
    </>
  );
}

/** An edge label: the intent, then the protocol in its own span so an audience that doesn't need it can dim it. */
export function EdgeLabel({ intent, protocol }: { intent: string | null; protocol: string | null | undefined }): ReactNode {
  return (
    <>
      {intent}
      {protocol && <tspan className="c4-protocol">{`${intent ? ' ' : ''}[${protocol}]`}</tspan>}
    </>
  );
}
