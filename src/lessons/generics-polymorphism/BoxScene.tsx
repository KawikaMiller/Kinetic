import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { boxFrames, type BoxFrame } from './frames';
import { boxCode, type BoxCode, type BoxVersion } from './model';

const VERSIONS: { value: BoxVersion; label: string }[] = [
  { value: 'untyped', label: 'Untyped (any)' },
  { value: 'perType', label: 'One class per type' },
  { value: 'generic', label: 'Box<T>' },
  { value: 'bounded', label: 'Bounded T' },
];

const DIAGRAM_W = 300;
const DIAGRAM_H = 190;
const BOX = { x: 40, y: 62, w: 220, h: 100 };

function lineState(code: BoxCode, f: BoxFrame, i: number): LineState {
  if (f.failed && i === code.failLine) return 'bad';
  if (f.showDuplicates && code.duplicate.includes(i)) return 'now';
  const now = f.now === null ? [] : Array.isArray(f.now) ? f.now : [f.now];
  return now.includes(i) ? 'now' : 'idle';
}

/** The box: what the code claims it holds (the tag) against what is really inside (the pill). */
function BoxDiagram({ version, code, f, bound }: { version: BoxVersion; code: BoxCode; f: BoxFrame; bound: boolean }) {
  const compileReject = f.failed && code.failsAt === 'compile';
  const crashed = f.failed && code.failsAt === 'runtime';
  const title = version === 'perType' ? 'StringBox (and NumberBox…)' : version === 'bounded' ? 'max(a: T, b: T)' : version === 'generic' ? 'Box<T>' : 'Box';
  const tag = version === 'bounded' ? (bound ? 'T extends Comparable<T>' : 'T: any type') : version === 'generic' ? 'T = string' : version === 'untyped' ? `declared: ${f.claimed ?? 'any'}` : 'declared: string';
  const tagTone = version === 'generic' || version === 'bounded' ? 'violet' : 'muted';
  const inside =
    version === 'bounded'
      ? bound
        ? { text: 'compareTo ✓', tone: 'ok' }
        : { text: f.failed ? 'compareTo ✕' : 'compareTo ?', tone: f.failed ? 'orange' : 'muted' }
      : f.stored === null
        ? null
        : { text: f.stored, tone: crashed ? 'bad' : f.printed.length ? 'ok' : 'info' };
  const pillY = compileReject ? BOX.y - 30 : BOX.y + BOX.h / 2 + 8;
  return (
    <svg viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} className="gp-box-svg" role="img" aria-label={`${title}: ${tag}${inside ? `, holding ${inside.text}` : ', empty'}`}>
      <rect className="gp-box" x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} rx={12} />
      <text className="gp-box-title" x={BOX.x + 14} y={BOX.y + 22}>
        {title}
      </text>
      <g className={`gp-tag tone-${tagTone}`}>
        <rect x={BOX.x + BOX.w - 8 - tag.length * 7 - 16} y={BOX.y + BOX.h - 30} width={tag.length * 7 + 16} height={22} rx={11} />
        <text x={BOX.x + BOX.w - 8 - (tag.length * 7 + 16) / 2} y={BOX.y + BOX.h - 15} textAnchor="middle">
          {tag}
        </text>
      </g>
      {inside && (
        <g className={`gp-pill tone-${inside.tone} ${compileReject ? 'is-rejected' : ''}`}>
          <rect x={BOX.x + 14} y={pillY - 14} width={inside.text.length * 8 + 24} height={28} rx={14} />
          <text x={BOX.x + 14 + (inside.text.length * 8 + 24) / 2} y={pillY + 5} textAnchor="middle">
            {inside.text}
          </text>
        </g>
      )}
      {compileReject && version !== 'bounded' && (
        <text className="gp-reject" x={BOX.x + 14 + (f.stored ?? '').length * 8 + 34} y={pillY + 5}>
          ✕ rejected by tsc
        </text>
      )}
      {crashed && (
        <text className="gp-crash" x={BOX.x + 14} y={BOX.y + BOX.h + 22}>
          really a number: toUpperCase is missing
        </text>
      )}
    </svg>
  );
}

export function BoxScene({ picker }: { picker: ReactNode }) {
  const [version, setVersion] = useState<BoxVersion>('untyped');
  const [bound, setBound] = useState(false);
  const code = boxCode(version, bound);
  const frames = useMemo(() => boxFrames(version, bound), [version, bound]);
  const player = usePlayer(frames, { interval: 2200 });
  const f = player.frame;
  const compileFail = f.failed && code.failsAt === 'compile';
  const lines: ConsoleLine[] = compileFail ? code.message!.split('\n').map((text) => ({ text, tone: 'orange' })) : f.printed;
  const tool = code.lang === 'Java' ? 'javac' : code.failsAt === 'compile' ? 'tsc --strict' : 'run (JavaScript)';

  return (
    <StageFrame
      player={player}
      height={400}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'the type parameter' },
            { color: 'var(--info)', label: 'the value stored' },
            { color: 'var(--orange)', label: 'rejected at compile time' },
            { color: 'var(--bad)', label: 'thrown at run time' },
            { color: 'var(--ok)', label: 'checked and safe' },
            ...(version === 'perType' ? [{ color: 'var(--hi)', label: 'duplicated lines / line running' }] : [{ color: 'var(--hi)', label: 'line running or checked' }]),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Version" value={version} onChange={setVersion} options={VERSIONS} />
          {version === 'bounded' && <Toggle label="Bound" value={bound} onChange={setBound} off="<T>" on="<T extends Comparable<T>>" />}
        </>,
      ]}
    >
      <div className="gp stage-pad">
        <div className="gp-row">
          <div className="gp-col">
            <CodePanel
              title={`${code.label} · ${code.lang}`}
              lines={code.lines}
              stateOf={(i) => lineState(code, f, i)}
              className={`gp-code ${code.failsAt === 'compile' ? 'is-compile' : ''}`}
            />
            <ConsolePanel title={tool} lines={lines} error={f.failed && code.failsAt === 'runtime' ? code.message : undefined} empty="(nothing yet)" />
          </div>
          <div className="gp-col gp-diagram">
            <BoxDiagram version={version} code={code} f={f} bound={bound} />
          </div>
        </div>
        <Hint block>
          The TypeScript messages are real tsc output and the crash is what real JavaScript throws (both checked in the lesson&apos;s tests); the Java message is a fixed, real javac
          result (abridged), shown, not run.
        </Hint>
      </div>
    </StageFrame>
  );
}
