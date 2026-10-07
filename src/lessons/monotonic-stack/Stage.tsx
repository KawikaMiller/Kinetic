import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { CallStackPanel, type CallFrame } from '../../components/CallStackPanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { SPRING } from '../../core/motion';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { frames as buildFrames, totalsFor, type MsFrame, type Scene } from './frames';
import { K_CHOICES, MAX_VALUE, MAX_VALUES, parseValues, PRESETS } from './model';
import './styles.css';

const STEP_MS = 1100;

/** The bar chart's drawing box, in SVG units. */
const W = 480;
const PAD_X = 14;
const BASE_Y = 196;
const BAR_MAX_H = 112;
const BAR_W_MAX = 34;
/** Room between a bar's top and its value label, and between the label and an arrow's end. */
const LABEL_GAP = 6;
const ARROW_GAP = 18;
const ARC_LIFT = { base: 14, perStep: 4, max: 40 };
const INDEX_Y = BASE_Y + 18;
const ANSWER_Y = BASE_Y + 38;
const CURSOR_Y = BASE_Y + 46;
const H = BASE_Y + 62;
/** Smallest SVG text is 12px: keep it at the 8px floor on a phone. */
const SVG_MIN_WIDTH = minWidthForText(W, 12);

const SCENES: { value: Scene; label: string }[] = [
  { value: 'warmer', label: 'Next warmer day' },
  { value: 'window', label: 'Window maximum' },
  { value: 'rect', label: 'Largest rectangle' },
];

const NOUN: Record<Scene, string> = { warmer: 'day', window: 'index', rect: 'bar' };

export function Stage() {
  const [scene, setScene] = useState<Scene>('warmer');
  const [values, setValues] = useState<number[]>(PRESETS.warmer[0].values);
  const [draft, setDraft] = useState(PRESETS.warmer[0].values.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState<number>(3);
  const kUsed = Math.max(1, Math.min(k, values.length));

  const frames = useMemo(() => buildFrames(scene, values, kUsed), [scene, values, kUsed]);
  const totals = useMemo(() => totalsFor(scene, values, kUsed), [scene, values, kUsed]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const n = values.length;

  const load = (vs: number[]) => {
    setValues(vs);
    setDraft(vs.join(', '));
    setError(null);
  };
  const chooseScene = (s: Scene) => {
    setScene(s);
    load(PRESETS[s][0].values);
  };
  const apply = () => {
    const parsed = parseValues(draft);
    if (!parsed.ok) return setError(parsed.error);
    load(parsed.values);
  };

  const presetOn = (vs: readonly number[]) => vs.length === n && vs.every((x, i) => x === values[i]);

  return (
    <StageFrame
      player={player}
      height={340}
      stats={
        <Stats>
          <Stat label="Pushes + pops" value={f.pushes + f.pops} color="var(--violet)" sub={`of ${totals.work} · never above 2n = ${2 * n}`} />
          <Stat label="Brute force" value={totals.brute} color="var(--muted)" sub={totals.bruteUnit} />
          {scene === 'rect' && <Stat label="Best area" value={f.best?.area ?? '–'} color="var(--ok)" />}
          {scene === 'window' && <Stat label="Window" value={kUsed} color="var(--hi)" sub="k values" />}
        </Stats>
      }
      legend={<Legend items={legendFor(scene)} />}
      controls={[
        <>
          <Segmented label="Problem" value={scene} onChange={chooseScene} options={SCENES} />
          {scene === 'window' && (
            <>
              <Segmented label="k" value={k} onChange={setK} options={K_CHOICES.map((v) => ({ value: v, label: String(v) }))} />
              {n > 0 && kUsed < k && <Hint>Only {n} values, so the window uses k = {kUsed}.</Hint>}
            </>
          )}
        </>,
        <>
          <TextField label="Values" value={draft} onChange={setDraft} onEnter={apply} width={250} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <ControlGroup label="Presets" inline>
            {PRESETS[scene].map((p) => (
              <ChipButton key={p.id} tone="info" on={presetOn(p.values)} onClick={() => load(p.values)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="ms-input-note">
            <span role="status">{error ?? `Up to ${MAX_VALUES} whole numbers from 0 to ${MAX_VALUE}, separated by commas or spaces.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ms stage-pad">
        <div className="ms-main">
          <WideRegion minWidth={SVG_MIN_WIDTH} label="Bars: scroll sideways to see all of them">
            <Bars scene={scene} values={values} f={f} />
          </WideRegion>
          <Hint block>
            {rowKey(scene)} Nothing simulated: computed live.
          </Hint>
        </div>
        <div className="ms-side">
          <CallStackPanel
            title={scene === 'window' ? 'Deque' : 'Stack'}
            meta={scene === 'window' ? 'front at top' : 'newest on top'}
            anchor={scene === 'window' ? 'top' : 'bottom'}
            showDepth={false}
            minHeight={180}
            frames={stackFrames(scene, values, f)}
            empty={<p className="empty-note">empty</p>}
          />
        </div>
      </div>
    </StageFrame>
  );
}

function legendFor(scene: Scene) {
  const common = [
    { color: 'var(--hi)', label: 'scan cursor', shape: 'dot' as const },
    { color: 'var(--violet)', label: scene === 'window' ? 'in the deque' : 'on the stack' },
    { color: 'var(--info)', label: 'just popped' },
  ];
  if (scene === 'warmer') return [...common, { color: 'var(--ok)', label: 'answer arrow', shape: 'line' as const }, { color: 'var(--dim)', label: 'no warmer day' }];
  if (scene === 'window') return [...common, { color: 'var(--ok)', label: 'window max' }];
  return [...common, { color: 'var(--ok)', label: 'best rectangle', shape: 'line' as const }];
}

function rowKey(scene: Scene): string {
  if (scene === 'warmer') return 'Under each bar: its day number, then how many days it waits for a strictly warmer one (– means never).';
  if (scene === 'window') return 'Under each bar: its index, then the maximum of the window that ends there.';
  return 'Under each bar: its index. The dashed box is the rectangle of the bar just popped.';
}

/** The stack (top first, as CallStackPanel wants) or deque (front first), with the popped item still shown. */
function stackFrames(scene: Scene, values: readonly number[], f: MsFrame): CallFrame[] {
  const item = (i: number, state: CallFrame['state'] = 'idle'): CallFrame => ({
    id: i,
    name: `${NOUN[scene]} ${i}`,
    detail: String(values[i]),
    state,
    tone: state === 'idle' ? 'violet' : undefined,
  });
  if (scene === 'window') {
    const items = f.stack.map((i) => item(i));
    if (f.popped === null) return items;
    // An index leaving at the front is older than everything left; one leaving at the back is newer.
    const front = f.stack.length === 0 || f.popped < f.stack[0];
    return front ? [item(f.popped, 'returning'), ...items] : [...items, item(f.popped, 'returning')];
  }
  const items = [...f.stack].reverse().map((i) => item(i));
  return f.popped === null ? items : [item(f.popped, 'returning'), ...items];
}

type BarRole = 'scan' | 'stack' | 'popped' | 'none' | 'past' | 'future';

function Bars({ scene, values, f }: { scene: Scene; values: readonly number[]; f: MsFrame }) {
  const arrow = useArrowMarker('var(--ok)', { size: 6, refX: 9 });
  const n = values.length;
  const slot = (W - 2 * PAD_X) / Math.max(1, n);
  const barW = Math.min(BAR_W_MAX, slot * 0.66);
  const cx = (i: number) => PAD_X + slot * (i + 0.5);
  const maxV = Math.max(1, ...values);
  const hOf = (v: number) => (v / maxV) * BAR_MAX_H;
  const topOf = (i: number) => BASE_Y - hOf(values[i]);
  const onStack = new Set(f.stack);
  const reached = f.done ? n : f.scan ?? -1;

  const role = (i: number): BarRole => {
    if (i === f.popped) return 'popped';
    if (i === f.scan) return 'scan';
    if (onStack.has(i)) return f.done && scene === 'warmer' ? 'none' : 'stack';
    if (scene === 'warmer' && f.answers[i] === null) return 'none';
    if (i <= reached || (scene === 'rect' && f.scan === null && f.pops > 0)) return 'past';
    return 'future';
  };

  const answerText = (i: number): { text: string; tone: 'ok' | 'dim' } | null => {
    if (scene === 'warmer') {
      const a = f.answers[i];
      if (a === undefined) return null;
      return a === null ? { text: '–', tone: 'dim' } : { text: String(a - i), tone: 'ok' };
    }
    if (scene === 'window') {
      const m = f.maxes[i];
      return m === undefined ? null : { text: String(m), tone: 'ok' };
    }
    return null;
  };

  const rectBox = (r: { from: number; to: number; height: number }) => ({
    x: cx(r.from) - barW / 2 - 3,
    y: BASE_Y - hOf(r.height),
    width: cx(r.to) - cx(r.from) + barW + 6,
    height: hOf(r.height),
  });

  const arrows = scene === 'warmer'
    ? f.answers.flatMap((a, j) => (typeof a === 'number' ? [{ j, i: a }] : []))
    : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ms-svg" role="img" aria-label={ariaSummary(scene, values, f)}>
      {arrow.def}
      {f.window && (
        <motion.rect
          className="ms-window"
          initial={false}
          animate={{ x: PAD_X + slot * f.window[0] + 2, width: slot * (f.window[1] - f.window[0] + 1) - 4 }}
          transition={SPRING.snappy}
          y={22}
          height={BASE_Y - 22}
          rx={8}
        />
      )}
      {f.best && scene === 'rect' && <rect className="ms-best" rx={3} {...rectBox(f.best)} />}
      {f.rect && (
        <g>
          <rect className="ms-rect" rx={3} {...rectBox(f.rect)} />
          <text className="ms-rect-label" x={(cx(f.rect.from) + cx(f.rect.to)) / 2} y={BASE_Y - hOf(f.rect.height) - LABEL_GAP - 14}>
            area {f.rect.area}
          </text>
        </g>
      )}
      <line className="ms-base" x1={PAD_X} x2={W - PAD_X} y1={BASE_Y} y2={BASE_Y} />
      {values.map((v, i) => {
        const h = Math.max(2, hOf(v));
        const a = answerText(i);
        return (
          <g key={i} className={`ms-bar is-${role(i)}`}>
            <motion.rect
              x={cx(i) - barW / 2}
              width={barW}
              rx={4}
              initial={false}
              animate={{ y: BASE_Y - h, height: h }}
              transition={SPRING.snappy}
            />
            <text className="ms-value" x={cx(i)} y={BASE_Y - h - LABEL_GAP}>
              {v}
            </text>
            <text className="ms-index" x={cx(i)} y={INDEX_Y}>
              {i}
            </text>
            {a && (
              <text className={`ms-answer tone-${a.tone}`} x={cx(i)} y={ANSWER_Y}>
                {a.text}
              </text>
            )}
          </g>
        );
      })}
      {arrows.map(({ j, i }) => {
        const y1 = topOf(j) - ARROW_GAP;
        const y2 = topOf(i) - ARROW_GAP;
        const lift = Math.min(ARC_LIFT.max, ARC_LIFT.base + ARC_LIFT.perStep * (i - j));
        const d = `M ${cx(j)} ${y1} Q ${(cx(j) + cx(i)) / 2} ${Math.min(y1, y2) - lift} ${cx(i)} ${y2}`;
        return (
          <motion.path
            key={j}
            d={d}
            className={`ms-arrow ${j === f.arrow ? 'is-new' : ''}`}
            markerEnd={arrow.url}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45 }}
          />
        );
      })}
      {f.scan !== null && (
        <motion.path
          className="ms-cursor"
          d="M 0 0 L 7 11 L -7 11 Z"
          initial={false}
          animate={{ x: cx(f.scan), y: CURSOR_Y }}
          transition={SPRING.snappy}
        />
      )}
    </svg>
  );
}

function ariaSummary(scene: Scene, values: readonly number[], f: MsFrame): string {
  const on = f.stack.length ? f.stack.join(', ') : 'nothing';
  const where = f.scan === null ? 'not scanning' : `scanning ${NOUN[scene]} ${f.scan}`;
  return `${values.length} bars, heights ${values.join(', ') || 'none'}; ${where}; ${scene === 'window' ? 'deque' : 'stack'} holds ${on}.`;
}
