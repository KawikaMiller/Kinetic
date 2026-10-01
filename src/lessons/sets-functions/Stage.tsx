import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { plural } from '../../core/format';
import type { Pt } from '../../core/geometry';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { MAP, VENN, chipWidth, columnY, membershipAt, placeElements, vennCircles, type Circle } from './layout';
import {
  MAPPINGS, OP_INFO, SET_PRESETS, applyOp, cardinalityLimits, classify, inResult, mappingChecks, moveElement, parseMembers, toggleArrow, universe,
  type Arrow, type CheckState, type Classification, type MappingPreset, type Op, type SetName,
} from './model';
import './styles.css';

const MIN_WIDTH = 420;
const SET_TONE: Record<SetName, string> = { A: 'var(--info)', B: 'var(--violet)', C: 'var(--orange)' };

const SCENES = [
  { value: 'sets' as const, label: 'Sets' },
  { value: 'functions' as const, label: 'Functions' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Pane', options: SCENES, initial: 'sets' });
  return scene === 'functions' ? <FunctionsScene picker={picker} /> : <SetsScene picker={picker} />;
}

// ── Sets ─────────────────────────────────────────────────────────────

type Texts = Record<SetName, string>;
const joinSets = (s: Record<SetName, string[]>): Texts => ({ A: s.A.join(', '), B: s.B.join(', '), C: s.C.join(', ') });

function SetsScene({ picker }: { picker: ReactNode }) {
  const [texts, setTexts] = useState<Texts>(() => joinSets(SET_PRESETS));
  const [three, setThree] = useState(false);
  const [op, setOp] = useState<Op>('intersection');
  const [drag, setDrag] = useState<{ name: string; at: Pt } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const setCaption = useSetCaption();

  const sets = { A: parseMembers(texts.A), B: parseMembers(texts.B), C: three ? parseMembers(texts.C) : [] };
  const els = universe(sets);
  const circles = vennCircles(three);
  const placed = placeElements(els, three);
  const result = applyOp(op, sets);
  const ops = (Object.keys(OP_INFO) as Op[]).filter((o) => three || !OP_INFO[o].needsC);

  useIntroCaption(
    <>Two sets of users drawn as circles. Pick an operation to shade its region; drag a name into another region to
      change which sets it's in.</>,
  );

  const chooseOp = (o: Op) => {
    setOp(o);
    const r = applyOp(o, sets);
    setCaption(
      <><b>{OP_INFO[o].symbol}</b> = {'{'}{r.join(', ') || '∅'}{'}'}: {plural(r.length, 'member')}. In SQL that's{' '}
        <code>{OP_INFO[o].sql}</code>.</>,
    );
  };

  const toggleThree = (on: boolean) => {
    setThree(on);
    const dropsOp = !on && OP_INFO[op].needsC;
    if (dropsOp) setOp('union');
    setCaption(
      on ? (
        <>A third set, C, joins as an orange circle. Three circles cut the box into 8 regions: every mix of in or out of
          A, B and C.</>
      ) : (
        <>Back to two sets, A and B: 4 regions.{dropsOp && <> That operation needs C, so the shading switched to A ∪ B.</>}</>
      ),
    );
  };

  const toSvg = (e: PointerEvent): Pt => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const drop = () => {
    if (!drag) return;
    const el = els.find((e) => e.name === drag.name);
    setDrag(null);
    if (!el) return;
    const m = membershipAt(drag.at, circles, el.m);
    const all = { A: parseMembers(texts.A), B: parseMembers(texts.B), C: parseMembers(texts.C) };
    setTexts(joinSets(moveElement(all, drag.name, m)));
    const where = (circles.map((c) => c.set) as SetName[]).filter((s) => m[s]);
    setCaption(
      <><b>{drag.name}</b> is now in {where.length ? where.join(' and ') : 'none of the sets'}.{' '}
        {inResult(op, m) ? <>That puts it inside <b>{OP_INFO[op].symbol}</b>.</> : <>It's outside {OP_INFO[op].symbol}.</>}</>,
    );
  };

  return (
    <StageFrame
      height={340}
      minWidth={MIN_WIDTH}
      stats={
        <Stats>
          <Stat label="|A|" value={sets.A.length} color={SET_TONE.A} />
          <Stat label="|B|" value={sets.B.length} color={SET_TONE.B} />
          {three && <Stat label="|C|" value={sets.C.length} color={SET_TONE.C} />}
          <Stat label={`|${OP_INFO[op].symbol}|`} value={result.length} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: SET_TONE.A, label: 'set A', shape: 'line' },
            { color: SET_TONE.B, label: 'set B', shape: 'line' },
            ...(three ? [{ color: SET_TONE.C, label: 'set C', shape: 'line' as const }] : []),
            { color: 'var(--hi)', label: 'the region you picked' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Operation" value={op} onChange={chooseOp} options={ops.map((o) => ({ value: o, label: OP_INFO[o].symbol }))} />
          <Toggle label="Sets" value={three} onChange={toggleThree} off="A, B" on="A, B, C" />
        </>,
        <>
          {(three ? (['A', 'B', 'C'] as SetName[]) : (['A', 'B'] as SetName[])).map((s) => (
            <TextField key={s} label={`Set ${s}`} value={texts[s]} onChange={(t) => setTexts({ ...texts, [s]: t })} width={210} spellCheck={false} />
          ))}
          <Button onClick={() => setTexts(joinSets(SET_PRESETS))}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad sf">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VENN.width} ${VENN.height}`}
          className="sf-svg"
          role="img"
          aria-label={`Venn diagram, ${OP_INFO[op].symbol} shaded`}
        >
          <rect x={6} y={6} width={VENN.width - 12} height={VENN.height - 12} rx={14} className="sf-universe" />
          <text x={22} y={30} className="sf-universe-label">everyone</text>
          <Shading op={op} circles={circles} />
          {circles.map((c) => (
            <g key={c.set}>
              <circle cx={c.cx} cy={c.cy} r={c.r} className="sf-circle" style={{ stroke: SET_TONE[c.set] }} />
              <text x={c.label.x} y={c.label.y} textAnchor="middle" className="sf-set-label" style={{ fill: SET_TONE[c.set] }}>
                {c.set}
              </text>
            </g>
          ))}
          {els.map((e) => {
            const at = drag?.name === e.name ? drag.at : placed[e.name];
            const w = chipWidth(e.name);
            return (
              <g
                key={e.name}
                transform={`translate(${at.x} ${at.y})`}
                className={`sf-chip ${inResult(op, e.m) ? 'is-in' : ''} ${drag?.name === e.name ? 'is-dragging' : ''}`}
                onPointerDown={(ev) => {
                  ev.currentTarget.setPointerCapture(ev.pointerId);
                  setDrag({ name: e.name, at: toSvg(ev) });
                }}
                onPointerMove={(ev) => drag?.name === e.name && setDrag({ ...drag, at: toSvg(ev) })}
                onPointerUp={drop}
                onPointerCancel={() => setDrag(null)}
              >
                <rect x={-w / 2} y={-11} width={w} height={22} rx={11} />
                <text y={4} textAnchor="middle">
                  {e.name}
                </text>
              </g>
            );
          })}
        </svg>
        <Box className="sf-result">
          <SectionTitle hint={`${plural(result.length, 'member')}`}>{OP_INFO[op].symbol}</SectionTitle>
          <p className="sf-members">{'{'} {result.join(', ') || '∅ (empty)'} {'}'}</p>
          <p className="sf-sql">
            SQL: <code>{OP_INFO[op].sql}</code>
          </p>
          <Hint>Joins themselves are in the "Tables, Rows &amp; Joins" lesson.</Hint>
        </Box>
      </div>
    </StageFrame>
  );
}

/** The picked region, shaded with clip paths and masks built from the circles. */
function Shading({ op, circles }: { op: Op; circles: Circle[] }) {
  const id = useId().replace(/:/g, '');
  const c = Object.fromEntries(circles.map((x) => [x.set, x])) as Record<SetName, Circle | undefined>;
  const disc = (x: Circle | undefined, extra: Record<string, string> = {}) =>
    x ? <circle cx={x.cx} cy={x.cy} r={x.r} className="sf-shade" {...extra} /> : null;
  const shape = (x: Circle | undefined, fill: string) => (x ? <circle cx={x.cx} cy={x.cy} r={x.r} fill={fill} /> : null);
  // SVG mask channels, never rendered as colours: white keeps what's under it, black cuts it away.
  const KEEP = 'white';
  const CUT = 'black';

  return (
    <>
      <defs>
        <clipPath id={`${id}-B`}>{shape(c.B, KEEP)}</clipPath>
        <clipPath id={`${id}-C`}>{shape(c.C, KEEP)}</clipPath>
        <mask id={`${id}-notB`}>
          <rect width={VENN.width} height={VENN.height} fill={KEEP} />
          {shape(c.B, CUT)}
        </mask>
        <mask id={`${id}-notA`}>
          <rect width={VENN.width} height={VENN.height} fill={KEEP} />
          {shape(c.A, CUT)}
        </mask>
      </defs>
      {(op === 'union' || op === 'union3') && (
        <>
          {disc(c.A)}
          {disc(c.B)}
          {op === 'union3' && disc(c.C)}
        </>
      )}
      {op === 'intersection' && disc(c.A, { clipPath: `url(#${id}-B)` })}
      {op === 'intersection3' && <g clipPath={`url(#${id}-C)`}>{disc(c.A, { clipPath: `url(#${id}-B)` })}</g>}
      {op === 'difference' && disc(c.A, { mask: `url(#${id}-notB)` })}
      {op === 'symmetric' && (
        <>
          {disc(c.A, { mask: `url(#${id}-notB)` })}
          {disc(c.B, { mask: `url(#${id}-notA)` })}
        </>
      )}
    </>
  );
}

// ── Functions ────────────────────────────────────────────────────────

const KIND_LABEL: Record<Classification['kind'], string> = {
  'not-a-function': 'Not a function',
  function: 'A function (neither one-to-one nor onto)',
  injective: 'Injective (one-to-one)',
  surjective: 'Surjective (onto)',
  bijective: 'Bijective (one-to-one and onto)',
};

function FunctionsScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<MappingPreset>(MAPPINGS[0]);
  const [arrows, setArrows] = useState<Arrow[]>(MAPPINGS[0].arrows);
  const [from, setFrom] = useState<number | null>(null);
  const setCaption = useSetCaption();
  const okArrow = useArrowMarker('var(--info)', { size: 6, refX: 9 });
  const badArrow = useArrowMarker('var(--bad)', { size: 6, refX: 9 });

  const { domain, codomain } = preset;
  const cls = classify(domain.length, codomain.length, arrows);
  const checks = mappingChecks(cls);
  const limits = cardinalityLimits(domain.length, codomain.length);
  const multi = new Set(cls.multi);
  const collide = new Set(cls.collisions);

  useIntroCaption(
    <>A mapping draws an arrow from each input on the left to an output on the right. Click an input, then an output,
      to add or remove an arrow; the badge classifies the mapping live.</>,
  );

  const load = (p: MappingPreset) => {
    setPreset(p);
    setArrows(p.arrows);
    setFrom(null);
    setCaption(presetCaption(p));
  };

  const pickOutput = (to: number) => {
    if (from === null) return;
    const next = toggleArrow(arrows, { from, to });
    setArrows(next);
    setFrom(null);
    setCaption(classCaption(classify(domain.length, codomain.length, next), domain, codomain), { quiet: true });
  };

  const activate = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  return (
    <StageFrame
      height={340}
      minWidth={MIN_WIDTH}
      stats={
        <Stats>
          <Stat label={`|${preset.domainLabel}|`} value={domain.length} color="var(--info)" />
          <Stat label={`|${preset.codomainLabel}|`} value={codomain.length} color="var(--violet)" />
          <Stat label="Arrows" value={arrows.length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'arrow (input → output)', shape: 'line' },
            { color: 'var(--bad)', label: 'rule broken: two arrows out, or a collision', shape: 'line' },
            { color: 'var(--hi)', label: 'input you picked' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Mappings">
            {MAPPINGS.map((p) => (
              <ChipButton key={p.id} size="md" on={preset.id === p.id} onClick={() => load(p)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button onClick={() => { setArrows([]); setFrom(null); }}>Clear arrows</Button>
          <Button onClick={() => setArrows(preset.arrows)}>Reset arrows</Button>
          <Hint>{from === null ? 'Click an input on the left to start an arrow.' : `Now click an output for ${domain[from]}.`}</Hint>
        </>,
      ]}
    >
      <div className="stage-pad sf">
        <svg viewBox={`0 0 ${MAP.width} ${MAP.height}`} className="sf-svg" role="img" aria-label="Mapping diagram">
          <defs>
            {okArrow.def}
            {badArrow.def}
          </defs>
          <text x={MAP.domainX} y={18} textAnchor="middle" className="sf-col-label">{preset.domainLabel}</text>
          <text x={MAP.codomainX} y={18} textAnchor="middle" className="sf-col-label">{preset.codomainLabel}</text>
          {arrows.map((a, k) => {
            const bad = multi.has(a.from) || collide.has(a.to);
            const y1 = columnY(a.from, domain.length);
            const y2 = columnY(a.to, codomain.length);
            return (
              <line
                key={`${a.from}-${a.to}-${k}`}
                x1={MAP.domainX + 11}
                y1={y1}
                x2={MAP.codomainX - 13}
                y2={y2}
                className={`sf-arrow ${bad ? 'is-bad' : ''}`}
                markerEnd={bad ? badArrow.url : okArrow.url}
              />
            );
          })}
          {domain.map((name, i) => {
            const y = columnY(i, domain.length);
            const missing = cls.missing.includes(i);
            return (
              <g
                key={name}
                className={`sf-dot sf-in ${from === i ? 'is-picked' : ''} ${missing ? 'is-missing' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Input ${name}`}
                onClick={() => setFrom(from === i ? null : i)}
                onKeyDown={activate(() => setFrom(from === i ? null : i))}
              >
                <circle cx={MAP.domainX} cy={y} r={9} />
                <text x={MAP.domainX - 18} y={y + 4} textAnchor="end">{name}</text>
              </g>
            );
          })}
          {codomain.map((name, i) => {
            const y = columnY(i, codomain.length);
            return (
              <g
                key={name}
                className={`sf-dot sf-out ${collide.has(i) ? 'is-collision' : ''} ${cls.unused.includes(i) ? 'is-unused' : ''} ${from !== null ? 'is-target' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Output ${name}`}
                onClick={() => pickOutput(i)}
                onKeyDown={activate(() => pickOutput(i))}
              >
                <circle cx={MAP.codomainX} cy={y} r={9} />
                <text x={MAP.codomainX + 18} y={y + 4}>{name}</text>
              </g>
            );
          })}
        </svg>
        <Box className="sf-result">
          <SectionTitle>Classification</SectionTitle>
          <p className={`sf-kind is-${cls.kind}`}>{KIND_LABEL[cls.kind]}</p>
          <ul className="sf-checks">
            <Check state={checks.total} label="every input has an output (total)" />
            <Check state={checks.single} label="no input has two outputs" />
            <Check state={checks.injective} label="no two inputs share an output (injective)" />
            <Check state={checks.surjective} label="every output is used (surjective)" />
          </ul>
          {!cls.isFunction && <p className="sf-card">– : needs a function first.</p>}
          <p className="sf-card">
            |{preset.domainLabel}| = {domain.length}, |{preset.codomainLabel}| = {codomain.length}.{' '}
            {!limits.injectionPossible
              ? `More inputs than outputs: no mapping can be one-to-one (pigeonhole).`
              : !limits.surjectionPossible
                ? `Fewer inputs than outputs: no mapping can hit every output.`
                : 'Equal sizes: a bijection is possible.'}
          </p>
        </Box>
      </div>
    </StageFrame>
  );
}

const CHECK_MARK = { ok: '✓', no: '✗', na: '–' } as const;
const CHECK_SR = { ok: 'yes', no: 'no', na: 'not applicable' } as const;

function Check({ state, label }: { state: CheckState; label: string }) {
  return (
    <li className={`is-${state}`}>
      <span aria-hidden="true">{CHECK_MARK[state]}</span> {label}
      <span className="sf-sr">: {CHECK_SR[state]}</span>
    </li>
  );
}

function presetCaption(p: MappingPreset): ReactNode {
  switch (p.id) {
    case 'ids':
      return <>Every user gets exactly one id and every id belongs to exactly one user: a <b>bijection</b>, so you can
        always go back from id to user.</>;
    case 'hash':
      return <>{p.domain.length} strings into {p.codomain.length} buckets. It's a function (each string has one bucket), but
        with more strings than buckets two <span className="hl bad">must</span> share one: the pigeonhole principle, and
        why hash collisions are inevitable.</>;
    case 'birthday':
      return <>Everyone has one birthday, so it's a function. Two people share a date (not one-to-one) and some dates have
        nobody (not onto). Sharing an output is allowed.</>;
    default:
      return <>A blank mapping. Draw arrows and watch the badge: try one arrow per input, then give one input two arrows.</>;
  }
}

function classCaption(c: Classification, domain: string[], codomain: string[]): ReactNode {
  if (c.multi.length) return <><b>{domain[c.multi[0]]}</b> has two arrows now, so this is <span className="hl bad">not a function</span>: an input must have exactly one output.</>;
  if (c.missing.length) return <><b>{domain[c.missing[0]]}</b> has no arrow yet, so it's not a function everywhere. {plural(c.missing.length, 'input')} left.</>;
  if (c.collisions.length) return <>A function, but <b>{codomain[c.collisions[0]]}</b> is hit twice: not one-to-one.</>;
  return <>{KIND_LABEL[c.kind]}.</>;
}
