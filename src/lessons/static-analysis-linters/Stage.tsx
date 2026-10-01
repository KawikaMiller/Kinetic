import { LayoutGroup, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Legend, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import {
  detections, LAYER_NAMES, LAYER_TOOLS, LAYERS, PROBLEMS, reindent, sampleLines, sieve, tokens, type Layer, type Outcome,
  type ProblemId,
} from './model';
import { RulePeek } from './RulePeek';
import './styles.css';

/** Short name of what flags each problem, shown at the end of the flagged line. */
const RULE_SHORT: Record<ProblemId, string> = {
  indent: 'prettier',
  unused: 'no-unused-vars',
  looseEq: 'eqeqeq',
  floating: 'no-floating-promises',
  nullable: 'TS18047',
  offByOne: 'test failed',
};

/** The inline comment adds a line above SAMPLE line 2, pushing later lines down by one. */
const COMMENT_AT = 2;
/** The problem-by-tool table needs this much room for every column to stay readable. */
const MATRIX_MIN_WIDTH = 520;
const displayLine = (sampleLine: number, disable: boolean) => (disable && sampleLine >= COMMENT_AT ? sampleLine + 1 : sampleLine);

/** Caption for the current tool setup: what still ships, and why. */
function describe(active: ReadonlySet<Layer>, disable: boolean): ReactNode {
  const out = sieve(active, disable);
  const left = PROBLEMS.filter((p) => out[p.id] === 'production');
  if (left.length === 0) return <>Every layer on: <span className="hl ok">nothing reaches production</span>. Each tool caught something the others couldn't.</>;
  const onlyLinter = active.size === 1 && active.has('linter');
  return (
    <>
      {onlyLinter ? <>The linter passes the rest, </> : null}
      <span className="hl bad">{left.length} still {left.length === 1 ? 'ships' : 'ship'}</span>: {left.map((p) => p.label).join(', ')}.
      {disable && out.looseEq === 'production' ? <> The inline disable comment let <code>==</code> slip through.</> : null}
    </>
  );
}

export function Stage() {
  const [active, setActive] = useState<Set<Layer>>(new Set());
  const [disable, setDisable] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  /** What the learner changed last, so the caption can say why the result moved. */
  const [lastChange, setLastChange] = useState<'layer' | 'disabled' | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>Six problems are hiding in this function. With no tools switched on, <span className="hl bad">all six ship to production</span>. Turn the layers on one by one.</>,
  );

  const lines = useMemo(() => sampleLines(disable), [disable]);
  const outcome = useMemo(() => sieve(active, disable), [active, disable]);
  const can = useMemo(() => detections(disable), [disable]);
  const escaped = PROBLEMS.filter((p) => outcome[p.id] === 'production');

  // Functional updates, so quick successive clicks never build on a stale set; the caption
  // follows the committed state.
  const toggleLayer = (layer: Layer, on: boolean) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (on) next.add(layer);
      else next.delete(layer);
      return next;
    });
    setLastChange('layer');
  };
  const toggleDisable = (on: boolean) => {
    setDisable(on);
    setLastChange(on ? 'disabled' : 'layer');
  };
  useEffect(() => {
    if (!lastChange) return;
    setCaption(
      lastChange === 'disabled' ? (
        <>An <code>eslint-disable-next-line</code> comment turns eqeqeq off for one line. Handy for a real exception, but here it hides a bug. {describe(active, disable)}</>
      ) : (
        describe(active, disable)
      ),
    );
  }, [active, disable, lastChange, setCaption]);

  const flagsOn = (i: number) => PROBLEMS.filter((p) => displayLine(p.line, disable) === i && outcome[p.id] !== 'production');
  const formatted = reindent(lines);

  return (
    <StageFrame
      height={460}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'flagged line' },
            { color: 'var(--ok)', label: 'caught by a tool that is on' },
            { color: 'var(--bad)', label: 'escaped to production' },
            { color: 'var(--dim)', label: 'tool switched off' },
          ]}
        />
      }
      controls={[
        <>
          {LAYERS.map((l) => (
            <Toggle key={l} label={LAYER_NAMES[l]} value={active.has(l)} onChange={(on) => toggleLayer(l, on)} />
          ))}
        </>,
        <>
          <Toggle label="Silence eqeqeq on the == line" value={disable} onChange={toggleDisable} off="No comment" on="eslint-disable" />
          <Toggle label="Formatter diff" value={showDiff} onChange={setShowDiff} off="Hidden" on="Shown" />
        </>,
      ]}
    >
      <div className="sa stage-pad">
        <div className="sa-top">
          <CodePanel
            title="renderOrders.ts"
            lines={lines}
            stateOf={(i) => (flagsOn(i).length ? 'now' : 'idle')}
            trailing={(i) => (flagsOn(i).length ? flagsOn(i).map((p) => RULE_SHORT[p.id]).join(' · ') : null)}
          />
          <LayoutGroup>
            <div className="sa-sieve" aria-label="Where each problem is caught">
              {LAYERS.map((l) => (
                <Band key={l} title={LAYER_NAMES[l]} sub={LAYER_TOOLS[l]} state={active.has(l) ? 'on' : 'off'}>
                  {PROBLEMS.filter((p) => outcome[p.id] === l).map((p) => (
                    <ProblemChip key={p.id} id={p.id} label={p.label} outcome={l} />
                  ))}
                </Band>
              ))}
              <Band title="Production" sub={`${escaped.length} of ${PROBLEMS.length} shipped`} state="prod">
                {escaped.map((p) => (
                  <ProblemChip key={p.id} id={p.id} label={p.label} outcome="production" />
                ))}
              </Band>
            </div>
          </LayoutGroup>
        </div>

        <Box variant="sunken" className="sa-matrix-box">
          <SectionTitle hint="which tool can catch which problem">Problem × tool</SectionTitle>
          {/* The Tests column carries the lesson's point: on a phone the table scrolls, with a swipe hint and fades. */}
          <WideRegion minWidth={MATRIX_MIN_WIDTH} label="Problem by tool table: scroll sideways to see every tool" hint="swipe to see every tool">
            <table className="data-table sa-matrix">
              <thead>
                <tr>
                  <th>Problem</th>
                  {LAYERS.map((l) => (
                    <th key={l} className={active.has(l) ? '' : 'is-off'}>
                      {LAYER_NAMES[l]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROBLEMS.map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}</td>
                    {LAYERS.map((l) => (
                      <td key={l} className={`${active.has(l) ? '' : 'is-off'} ${outcome[p.id] === l ? 'is-caught' : ''}`}>
                        {can[p.id].has(l) ? '✓' : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
        </Box>

        <div className="sa-bottom">
          {showDiff && <FormatterDiff before={lines} after={formatted} />}
          <RulePeek lines={lines} />
        </div>
      </div>
    </StageFrame>
  );
}

function Band({ title, sub, state, children }: { title: string; sub: string; state: 'on' | 'off' | 'prod'; children: ReactNode[] }) {
  return (
    <div className={`sa-band is-${state}`}>
      <div className="sa-band-head">
        <b>{title}</b>
        <span>{state === 'off' ? 'off' : sub}</span>
      </div>
      <div className="sa-band-items">{children}</div>
    </div>
  );
}

function ProblemChip({ id, label, outcome }: { id: ProblemId; label: string; outcome: Outcome }) {
  return (
    <motion.span layoutId={`sa-${id}`} layout transition={SPRING.snappy} className={`chip ${outcome === 'production' ? 'tone-bad' : 'tone-ok'}`}>
      {label}
    </motion.span>
  );
}

function FormatterDiff({ before, after }: { before: string[]; after: string[] }) {
  const changed = (i: number) => before[i] !== after[i];
  const same = tokens(before).join(' ') === tokens(after).join(' ');
  return (
    <Box variant="sunken" className="sa-diff">
      <SectionTitle hint="indentation only, in this simplified formatter">What the formatter changed</SectionTitle>
      <div className="sa-diff-panes">
        <CodePanel title="before" lines={before} stateOf={(i) => (changed(i) ? 'cut' : 'idle')} />
        <CodePanel title="after" lines={after} stateOf={(i) => (changed(i) ? 'done' : 'idle')} />
      </div>
      <span className={`chip ${same ? 'tone-ok' : 'tone-bad'}`}>{same ? 'same tokens: the meaning is unchanged' : 'tokens differ'}</span>
      <p className="sa-peek-note">
        Real Prettier also rewraps long lines and normalises quotes (<code>'No orders'</code> becomes <code>"No orders"</code>): the
        tokens change spelling, but the meaning still doesn&apos;t.
      </p>
    </Box>
  );
}
