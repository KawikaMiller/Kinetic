import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { HeapObject, RefArrow, VarSlot, heapFieldPort, heapRect, slotPort, type HeapField } from '../../components/memory';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { toneVar, type Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { varianceFrames } from './frames';
import { OPS, VIEWS, varianceLines, verdict, view, type Op, type VerdictKind, type ViewId } from './model';

const SCENE_W = 540;
const SCENE_H = 250;
const CATS_AT = { x: 16, y: 34 };
const VIEW_AT = { x: 16, y: 104 };
const A_AT = { x: 16, y: 190 };
const HEAP_AT = { x: 320, y: 30 };
const HEAP_W = 200;
const GATE_X = 238;
const SOURCE = { x: 120, y: 222 };
/** How far before the gate a rejected value's pill stops (about half a pill). */
const PILL_CLEARANCE = 46;
const GATE_H = 64;

const TONE: Record<VerdictKind, Tone> = { ok: 'ok', compile: 'orange', runtime: 'bad', unsound: 'bad' };

export function VarianceScene({ picker }: { picker: ReactNode }) {
  const [viewId, setViewId] = useState<ViewId>('extends');
  const [op, setOp] = useState<Op>('read');
  const frames = useMemo(() => varianceFrames(viewId, op), [viewId, op]);
  const player = usePlayer(frames, { interval: 1800 });
  const f = player.frame;
  const v = view(viewId);
  const ver = verdict(viewId, op);
  const lines = varianceLines(viewId, op);
  const java = v.lang === 'Java';
  const isArray = viewId === 'javaArray' || viewId === 'tsArray';
  const name = viewId === 'super' ? 'sink' : 'animals';
  const shownDeclared = f.judged || player.index > 0;
  const declareRejected = ver.at === 'declare' && f.judged;
  const writes = op !== 'read';
  const item = op === 'addDog' ? 'Dog' : 'Cat';
  const stored = f.judged && writes && (ver.kind === 'ok' || ver.kind === 'unsound');

  const fields: HeapField[] = [{ name: '[0]', value: 'Cat' }];
  if (stored) {
    const value = item === 'Dog' ? <tspan className="gp-corrupt">Dog ⚠</tspan> : 'Cat';
    // A Java array has a fixed length, so the store replaces [0]; the lists and the JS array grow.
    fields.splice(isArray && java ? 0 : 1, isArray && java ? 1 : 0, { name: isArray && java ? '[0]' : '[1]', value });
  }
  const heapTitle = isArray ? (java ? 'Cat[] (length 1)' : 'Cat[] (a JS array)') : 'ArrayList<Cat>';
  const heap = heapRect(HEAP_AT, HEAP_W, fields.length);
  const toHeap = { x: HEAP_AT.x, y: HEAP_AT.y + 50 };
  // The value's route, and where it crosses the compiler's gate.
  const route = writes ? [SOURCE, toHeap] : [heapFieldPort(HEAP_AT, HEAP_W, 0, 'left'), slotPort(A_AT)];
  const dx = route[1].x - route[0].x;
  const gateT = (GATE_X - route[0].x) / dx;
  const gateY = route[0].y + gateT * (route[1].y - route[0].y);
  const stopBeforeGate = (Math.abs(GATE_X - route[0].x) - PILL_CLEARANCE) / Math.abs(dx);

  const stateOf = (i: number): LineState => {
    if (f.judged && (ver.at === 'declare' ? 0 : 1) === i) return ver.kind === 'ok' ? 'done' : 'bad';
    return i === f.line ? 'now' : i < f.line ? 'past' : 'idle';
  };
  const consoleTone = TONE[ver.kind];

  return (
    <StageFrame
      player={player}
      height={480}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'reference', shape: 'line' },
            { color: 'var(--hi)', label: 'line being checked' },
            { color: 'var(--orange)', label: 'compile-time rejection' },
            { color: 'var(--bad)', label: 'run-time exception / corrupted list' },
            { color: 'var(--ok)', label: 'checked safe' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="View the list of cats as">
            {VIEWS.map((x) => (
              <ChipButton key={x.id} tone="violet" on={x.id === viewId} onClick={() => setViewId(x.id)}>
                {x.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Then" value={op} onChange={setOp} options={OPS.map((o) => ({ value: o.id, label: o.label }))} />
        </>,
      ]}
    >
      <div className="gp stage-pad">
        <WideRegion minWidth={480} label="The list and its two references: scroll sideways to see all of it">
          <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="gp-var-svg" role="img" aria-label={`cats and ${name} referring to one ${heapTitle}`}>
            <VarSlot at={CATS_AT} name="cats" isRef tone="violet" />
            <text className="gp-decl" x={CATS_AT.x} y={CATS_AT.y - 8}>
              {java ? (isArray ? 'Cat[]' : 'List<Cat>') : 'Cat[]'}
            </text>
            <VarSlot at={VIEW_AT} name={name} isRef tone={declareRejected ? 'orange' : 'violet'} highlight={f.line === 0 && !f.judged && player.index > 0} />
            <text className={`gp-decl ${declareRejected ? 'is-rejected' : ''}`} x={VIEW_AT.x} y={VIEW_AT.y - 8}>
              {v.label.replace(/ \(.*\)$/, '')}
            </text>
            <HeapObject at={HEAP_AT} w={HEAP_W} title={heapTitle} fields={fields} highlight={f.judged && ver.kind === 'runtime'} tone={f.judged && ver.kind === 'runtime' ? 'bad' : 'info'} />
            <RefArrow from={slotPort(CATS_AT)} to={heap} color="var(--violet)" />
            {shownDeclared && !declareRejected && <RefArrow from={slotPort(VIEW_AT)} to={heap} color="var(--violet)" bend={10} />}
            {declareRejected && (
              <g className="gp-gate">
                <line x1={slotPort(VIEW_AT).x} y1={slotPort(VIEW_AT).y} x2={GATE_X - 8} y2={slotPort(VIEW_AT).y - 10} />
                <rect x={GATE_X - 6} y={VIEW_AT.y - 30} width={12} height={60} rx={4} />
                <text x={GATE_X + 14} y={VIEW_AT.y + 22}>
                  ✕ javac
                </text>
              </g>
            )}
            {!writes && <VarSlot at={A_AT} name="a" isRef={false} value={f.judged && ver.kind === 'ok' ? 'Cat' : f.judged ? '✕' : ''} tone={f.judged ? TONE[ver.kind] : 'info'} />}
            {!writes && (
              <text className="gp-decl" x={A_AT.x} y={A_AT.y - 8}>
                Animal
              </text>
            )}
            {f.judged && ver.kind === 'compile' && ver.at === 'op' && (
              <g className="gp-gate">
                <rect x={GATE_X - 6} y={gateY - GATE_H / 2} width={12} height={GATE_H} rx={4} />
                <text x={GATE_X + 14} y={gateY + GATE_H / 2}>
                  ✕ {java ? 'javac' : 'tsc'}
                </text>
              </g>
            )}
            {f.judged && ver.at === 'op' && <line className="scene-edge" x1={route[0].x} y1={route[0].y} x2={route[1].x} y2={route[1].y} />}
            {f.judged && ver.at === 'op' && (
              <Packet
                key={`${viewId}-${op}-${player.index}`}
                path={route}
                stopAt={ver.kind === 'compile' ? stopBeforeGate : undefined}
                label={writes ? `new ${item}()` : 'Cat'}
                color={toneVar(TONE[ver.kind])}
                arrive={ver.kind === 'compile' ? 'stay' : 'absorb'}
                duration={1}
              />
            )}
            {writes && !f.judged && (
              <text className="gp-decl" x={SOURCE.x - 30} y={SOURCE.y + 4}>
                new {item}()
              </text>
            )}
          </svg>
        </WideRegion>
        <div className="gp-row">
          <div className="gp-col">
            <CodePanel title={`${v.lang} · cats holds only Cat objects`} lines={lines} stateOf={stateOf} className={`gp-code ${ver.kind === 'compile' ? 'is-compile' : ''}`} />
          </div>
          <div className="gp-col">
            <ConsolePanel
              title={ver.kind === 'compile' ? (java ? 'javac' : 'tsc') : 'run'}
              lines={f.judged ? [{ text: ver.message, tone: consoleTone }] : []}
              empty="(not checked yet)"
            />
          </div>
        </div>
        <Hint block>
          Java results are fixed, real javac and JVM outputs (messages abridged, CAP#1 is javac&apos;s name for the unknown wildcard type), shown, not run. The TypeScript rows are what
          real tsc and JavaScript do, checked in the lesson&apos;s tests.
        </Hint>
      </div>
    </StageFrame>
  );
}
