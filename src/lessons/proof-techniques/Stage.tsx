import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TruthTable } from '../../components/TruthTable';
import { ChipButton, Hint, Legend, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { truthRowIndex } from '../../core/truth';
import { usePlayer } from '../../core/usePlayer';
import { useShake } from '../../core/useShake';
import { CLAIMS } from './claims';
import { proofFrames, readingText } from './frames';
import {
  checkEuler, displayOrder, EULER_MAX_N, firstFailure, FORMS, READING_OF, TECHNIQUE_NAMES, TECHNIQUES, type Claim, type ProofLine,
  type Technique,
} from './model';
import './styles.css';

const STEP_MS = 1400;
/** After a pick, jump to the newest frame: the player clamps this to the last one. */
const TO_END = Number.MAX_SAFE_INTEGER;
const EULER_COLS = 10;
const TECHNIQUE_OPTIONS = TECHNIQUES.map((t) => ({ value: t, label: TECHNIQUE_NAMES[t] }));

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Claim', options: CLAIMS.map((c) => ({ value: c.id, label: c.label })), initial: CLAIMS[0].id });
  const claim = CLAIMS.find((c) => c.id === scene)!;
  return <ClaimScene key={claim.id} claim={claim} picker={picker} />;
}

function ClaimScene({ claim, picker }: { claim: Claim; picker: ReactNode }) {
  const [technique, setTechnique] = useState<Technique>('direct');
  const [locked, setLocked] = useState(0);
  const [wrong, setWrong] = useState<readonly number[]>([]);
  const [shakeKey, setShakeKey] = useState(0);
  const setCaption = useSetCaption();
  const { shake } = useShake();
  useIntroCaption(<>Claim: "{claim.statement}" Pick a technique, then build the proof one line at a time.</>);

  const route = claim.routes[technique];
  const frames = useMemo(() => proofFrames(claim, technique, locked), [claim, technique, locked]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false, keyboard: route.kind === 'script' });
  const f = player.frame;
  const lines = route.kind === 'script' ? route.lines : [];
  const viewing = f.locked;
  const live = route.kind === 'script' && !f.complete && viewing === locked;

  const choose = (t: Technique) => {
    setTechnique(t);
    setLocked(0);
    setWrong([]);
  };
  // The chosen chip unmounts when its line locks in: hand focus to the next line's chips,
  // or to the reading once the proof is complete.
  const body = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    body.current?.querySelector<HTMLElement>('.pt-chips button, .pt-reading')?.focus();
  }, [locked]);

  const pick = (line: ProofLine, i: number) => {
    const c = line.candidates[i];
    if (c.ok) {
      refocus.current = true;
      player.queueNext({ play: false, from: TO_END });
      setLocked(locked + 1);
      setWrong([]);
      return;
    }
    setWrong(wrong.includes(i) ? wrong : [...wrong, i]);
    setShakeKey((k) => k + 1);
    setCaption(
      <>
        Rejected: <span className="hl bad">{c.reason}</span>.
      </>,
    );
  };

  // ---- the proof column ----
  const shownLines = lines.slice(0, viewing);
  const proofText =
    route.kind === 'stall'
      ? [...route.prefix, 'stuck: no valid next step on this route']
      : [...shownLines.map((l) => l.candidates.find((c) => c.ok)!.text), ...(f.complete ? [] : [`line ${viewing + 1}: pick a step below`])];
  const stateOf = (j: number): LineState => {
    if (route.kind === 'stall') return j === route.prefix.length ? 'bad' : 'done';
    if (j >= viewing) return 'now';
    return shownLines[j].role === 'clash' ? 'bad' : 'done';
  };

  const current = route.kind === 'script' && !f.complete ? lines[viewing] : null;
  const reading = READING_OF[technique];

  return (
    <StageFrame
      player={route.kind === 'script' ? player : undefined}
      height={420}
      stats={
        <Stats>
          <Stat label="Technique" value={TECHNIQUE_NAMES[technique]} color="var(--muted)" />
          <Stat label="Lines" value={route.kind === 'script' ? `${locked} of ${lines.length}` : '—'} color="var(--ok)" sub={route.kind === 'stall' ? 'this route stalls' : locked === lines.length ? 'proof complete' : 'locked in'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'line being filled', shape: 'square' },
            { color: 'var(--ok)', label: 'accepted step', shape: 'square' },
            { color: 'var(--bad)', label: 'rejected step / contradiction / counterexample', shape: 'square' },
            { color: 'var(--violet)', label: 'assumption', shape: 'square' },
            { color: 'var(--dim)', label: 'steps not chosen', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Technique" value={technique} onChange={choose} options={TECHNIQUE_OPTIONS} />
          <Hint>Steps are a fixed menu for each claim; real proofs are free-form.</Hint>
        </>,
      ]}
    >
      <div ref={body} className="pt stage-pad">
        <p className="pt-claim">
          <span className="pt-claim-tag">Claim</span> {claim.statement}
        </p>
        <CodePanel
          title={`${TECHNIQUE_NAMES[technique]} proof`}
          lines={proofText}
          stateOf={stateOf}
          renderLine={(text, j) => (route.kind === 'script' && j < viewing && shownLines[j].role === 'assume' ? <span className="pt-assume">{text}</span> : text)}
          trailing={(j) => (route.kind === 'script' && j < viewing ? shownLines[j].candidates.find((c) => c.ok)!.reason : null)}
          className="pt-proof"
        />

        {current && (
          <Box className="pt-choices">
            <SectionTitle hint={live ? 'pick one' : 'reviewing: the step chosen, and why the others fail'}>Line {viewing + 1}</SectionTitle>
            <div className="pt-chips">
              {displayOrder(current).map((i) => {
                const c = current.candidates[i];
                if (!live) {
                  return (
                    <span key={i} className={`chip pt-chip tone-${c.ok ? 'ok' : 'dim'} ${c.ok ? 'is-chosen' : ''}`}>
                      {c.text}
                    </span>
                  );
                }
                const tried = wrong.includes(i);
                const last = tried && wrong.at(-1) === i;
                return (
                  <motion.span key={`${i}-${last ? shakeKey : 0}`} className="pt-chip-wrap" animate={shake(last)}>
                    <ChipButton tone={tried ? 'bad' : 'info'} size="md" onClick={() => pick(current, i)} className="pt-chip">
                      {tried ? '✗ ' : ''}
                      {c.text}
                    </ChipButton>
                  </motion.span>
                );
              })}
            </div>
            <ul className="pt-reasons">
              {displayOrder(current)
                .filter((i) => (live ? wrong.includes(i) : true))
                .map((i) => {
                  const c = current.candidates[i];
                  return (
                    <li key={i} className={`tone-${c.ok ? 'ok' : 'bad'}`}>
                      <b>{c.ok ? '✓' : '✗'}</b> {c.text} <span>{c.reason}</span>
                    </li>
                  );
                })}
            </ul>
          </Box>
        )}

        {route.kind === 'stall' && (
          <p className="pt-stall">
            <b>{TECHNIQUE_NAMES[technique]} stalls here.</b> {route.why}
          </p>
        )}

        {f.complete && reading !== 'refute' && (
          <Box className="pt-reading" tabIndex={-1}>
            <SectionTitle>Read as propositional logic</SectionTitle>
            <p className="pt-gloss">{readingText(claim, technique)}</p>
            <TruthTable
              vars={FORMS[reading].vars}
              columns={FORMS[reading].columns.map((c) => ({ label: c.label, fn: c.fn }))}
              currentRow={reading === 'implies' ? truthRowIndex(['p', 'q'], { p: true, q: false }) : undefined}
              caption={reading === 'implies' ? 'Yellow row: the only case where p → q is false; the proof shows it cannot happen.' : 'Same column of T and F: the same statement.'}
              className="pt-table"
            />
          </Box>
        )}
        {f.complete && reading === 'refute' && (
          <Box className="pt-reading" tabIndex={-1}>
            <SectionTitle>Read as logic</SectionTitle>
            <p className="pt-gloss">{readingText(claim, technique)}</p>
          </Box>
        )}

        {claim.id === 'euler' && <EulerHunt />}
      </div>
    </StageFrame>
  );
}

/** The counterexample tool: test n = 0, 1, 2 … with a real primality check. */
function EulerHunt() {
  const [n, setN] = useState(0);
  const setCaption = useSetCaption();
  const check = checkEuler(n);
  const fail = firstFailure();
  const failuresSoFar = Array.from({ length: n + 1 }, (_, k) => k).filter((k) => !checkEuler(k).prime);
  const rows = Math.ceil((EULER_MAX_N + 1) / EULER_COLS);

  const move = (k: number) => {
    setN(k);
    const c = checkEuler(k);
    setCaption(
      c.prime ? (
        <>
          n = {k}: {k}² + {k} + 41 = {c.value}, <span className="hl ok">prime</span>.{' '}
          {k + 1 === fail ? `${k + 1} values in a row pass, and that still proves nothing about the next one.` : ''}
        </>
      ) : (
        <>
          n = {k}: {k}² + {k} + 41 = {c.value} = {c.factors.join(' × ')}, <span className="hl bad">not prime</span>.
          {k === fail ? ' The first counterexample: the claim is false.' : ''}
        </>
      ),
      { quiet: true },
    );
  };

  return (
    <Box className="pt-hunt">
      <SectionTitle hint="Miller-Rabin, exact at these sizes; factors by trial division">Counterexample hunt: n² + n + 41</SectionTitle>
      <Slider label="n" value={n} min={0} max={EULER_MAX_N} onChange={move} />
      <p className={`pt-check tone-${check.prime ? 'ok' : 'bad'}`}>
        {n}² + {n} + 41 = {check.value} {check.prime ? 'is prime' : `= ${check.factors.join(' × ')}, not prime`}
      </p>
      <CellGrid
        rows={rows}
        cols={EULER_COLS}
        size="sm"
        cell={(r, c) => {
          const k = r * EULER_COLS + c;
          if (k > n) return { tone: 'dim', fill: 'outline', text: k };
          return checkEuler(k).prime ? { tone: 'ok', fill: 'tint', text: k } : { tone: 'bad', fill: 'solid', text: k };
        }}
        highlight={[{ r: Math.floor(n / EULER_COLS), c: n % EULER_COLS, tone: 'hi' }]}
        ariaLabel={`Values of n tested so far: 0 to ${n}`}
        className="pt-grid"
      />
      <p className="pt-gloss">
        Tested {n + 1} value{n === 0 ? '' : 's'}: {failuresSoFar.length === 0 ? 'every one prime so far.' : `${failuresSoFar.length} not prime (first at n = ${failuresSoFar[0]}).`}
      </p>
    </Box>
  );
}
