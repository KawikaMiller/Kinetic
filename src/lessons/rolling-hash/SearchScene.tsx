import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { power } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { modText, searchFrames, type Hit } from './frames';
import { BASE, MAX_PATTERN, MAX_TEXT, MODULI, naiveComparisons, parseLetters, PRESETS, rabinKarp, type Modulus } from './model';

const STEP_MS = 1000;
const STRIP_MIN_W = 600;
/** Narrowest a text cell may get before the strip scrolls instead. */
const CELL_MIN = 26;
const CELL_MAX = 34;
const SHOW_SPACE = '␣';
const HIT_TONE: Record<Hit, Tone> = { none: 'hi', checking: 'info', match: 'ok', spurious: 'orange' };
const MOD_OPTIONS = MODULI.map((m) => ({ value: String(m), label: modText(m) }));

const cellsOf = (s: string) => [...s].map((c) => (c === ' ' ? SHOW_SPACE : c));

export function SearchScene({ picker }: { picker: ReactNode }) {
  const first = PRESETS[0];
  const [text, setText] = useState<string>(first.text);
  const [pattern, setPattern] = useState<string>(first.pattern);
  const [m, setM] = useState<Modulus>(first.modulus);
  const [draftText, setDraftText] = useState<string>(first.text);
  const [draftPattern, setDraftPattern] = useState<string>(first.pattern);
  const [error, setError] = useState<string | null>(null);

  const frames = useMemo(() => searchFrames(text, pattern, m), [text, pattern, m]);
  const run = useMemo(() => rabinKarp(text, pattern, m), [text, pattern, m]);
  const naive = useMemo(() => naiveComparisons(text, pattern), [text, pattern]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const len = pattern.length;

  const load = (p: (typeof PRESETS)[number]) => {
    setText(p.text);
    setPattern(p.pattern);
    setDraftText(p.text);
    setDraftPattern(p.pattern);
    setM(p.modulus);
    setError(null);
  };
  const apply = () => {
    const t = parseLetters(draftText, 'text');
    if (!t.ok) return setError(`Text: ${t.error}`);
    const p = parseLetters(draftPattern, 'pattern');
    if (!p.ok) return setError(`Pattern: ${p.error}`);
    setText(t.value);
    setPattern(p.value);
    setError(null);
  };

  const textState = (i: number): ArrayCellState => {
    if (i === f.outAt) return 'bad';
    if (i === f.inAt) return 'done';
    if (f.verifyAt !== null && f.s !== null && i === f.s + f.verifyAt) return 'info';
    if (f.done || (f.s !== null && i < f.s)) return 'dim';
    return 'idle';
  };
  const windowRange = f.s !== null && !f.done ? [{ from: f.s, to: f.s + len - 1, tone: HIT_TONE[f.hit], labels: [label(f.hit), ''] as const }] : [];
  const hashTone = f.hash === null ? 'var(--muted)' : f.hash === run.patternHash ? 'var(--info)' : 'var(--hi)';

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Hash updates" value={f.rolls} color="var(--hi)" sub={`of ${run.rolls}, O(1) each`} />
          <Stat label="Character checks" value={f.verifyChars} color="var(--info)" sub="only on hash hits" />
          <Stat label="Spurious hits" value={f.spurious.length} color="var(--orange)" sub="caught by the check" />
          <Stat label="Naïve scan" value={naive} color="var(--muted)" sub="character checks" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'window' },
            { color: 'var(--bad)', label: 'leaving' },
            { color: 'var(--ok)', label: 'entering / match' },
            { color: 'var(--info)', label: 'verifying' },
            { color: 'var(--orange)', label: 'spurious hit' },
            { color: 'var(--dim)', label: 'already checked' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Modulus M" value={String(m)} onChange={(v) => setM(BigInt(v) as Modulus)} options={MOD_OPTIONS} />
        </>,
        <>
          <TextField label="Text" value={draftText} onChange={setDraftText} onEnter={apply} width={300} spellCheck={false} />
          <TextField label="Pattern" value={draftPattern} onChange={setDraftPattern} onEnter={apply} width={110} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={text === p.text && pattern === p.pattern && m === p.modulus} onClick={() => load(p)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="rh-note">
            <span role="status">{error ?? `Lowercase letters and spaces: text up to ${MAX_TEXT}, pattern up to ${MAX_PATTERN}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="rh stage-pad">
        <WideRegion minWidth={Math.max(STRIP_MIN_W, [...text].length * CELL_MIN)} gutter={{ top: 28 }} label="Text strip: scroll sideways to see all of it">
          <ArrayStrip values={cellsOf(text)} showIndex cellMax={CELL_MAX} fontSize={14} cellState={textState} ranges={windowRange} />
        </WideRegion>
        <div className="rh-panels">
          <Box className="rh-pattern">
            <SectionTitle>Pattern · hash {String(run.patternHash)}</SectionTitle>
            <ArrayStrip
              values={cellsOf(pattern)}
              cellMax={CELL_MAX}
              fontSize={14}
              cellState={(k) => (f.verifyAt === k ? 'info' : 'idle')}
            />
          </Box>
          <Box className="rh-arith">
            <SectionTitle>
              Window hash <span style={{ color: hashTone }}>{f.hash === null ? '–' : String(f.hash)}</span>
            </SectionTitle>
            <p className="rh-formula">
              H = {power(Math.max(0, len - 1), Number(BASE))} mod {modText(m)} = {String(run.high)}, the leaving character's weight
            </p>
            <p className="rh-formula">
              {f.arith ? (
                <>
                  (<span className="rh-out">{String(f.arith.prev)} − {f.arith.out} × {String(run.high)}</span>) × {String(BASE)} +{' '}
                  <span className="rh-in">{f.arith.inc}</span> ≡ <b>{String(f.arith.next)}</b> (mod {modText(m)})
                </>
              ) : (
                <>new = ((old − out × H) × {String(BASE)} + in) mod M</>
              )}
            </p>
          </Box>
          <Tray stack label="Found" empty="no matches yet" className="rh-found">
            {f.matches.length || f.spurious.length
              ? [
                  ...f.matches.map((s) => <span key={`m${s}`} className="chip tone-ok">match at {s}</span>),
                  ...f.spurious.map((s) => <span key={`s${s}`} className="chip tone-orange">spurious at {s}</span>),
                ]
              : null}
          </Tray>
        </div>
        <Hint block>
          Base {String(BASE)} and moduli this small keep the arithmetic readable; real implementations use 64-bit arithmetic. With a fixed
          base, a window that doesn't match collides roughly 1 time in M when hashes spread evenly, a rule of thumb rather than a promise.
          Choosing the base at random makes it provable: at most (m − 1)/M per window for a prime M. Nothing here is simulated: it is computed
          live.
        </Hint>
      </div>
    </StageFrame>
  );
}

function label(hit: Hit): string {
  return hit === 'checking' ? 'hash hit: checking' : hit === 'match' ? 'match' : hit === 'spurious' ? 'spurious' : 'window';
}
