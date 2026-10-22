import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { useSetCaption } from '../../core/caption';
import { humanDurationLog10, power } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { bruteCaption, eveSees, group, messagesFor, numberFrames } from './frames';
import {
  DEFAULTS, DIGITS_MAX, DIGITS_MIN, EVE_SECRETS, TOY_WARNING, bruteForce, bruteLog10Seconds, exchange, gStrength, parseParams,
  type BruteForce, type DhParams, type GInfo, type ParamName,
} from './model';

const STEP_MS = 1700;
const ACTORS = [
  { id: 'alice', label: 'Alice' },
  { id: 'eve', label: 'Eve', tone: 'orange' as const },
  { id: 'bob', label: 'Bob' },
  // Workaround (Phase 2 request): sequenceLayout reserves no room for a self-message label on the
  // last lifeline, so Bob's "s = …" would overflow the drawing. An empty lane, hidden in CSS, makes room.
  { id: 'room', label: '', tone: 'dim' as const },
];
/** Lanes spread to this width on wide screens; phones keep the natural width, so the text stays bigger. */
const DIAGRAM_W = 640;
const PRESETS: { label: string; text: Record<ParamName, string> }[] = [
  { label: 'p = 23, g = 5', text: { p: '23', g: '5', a: '6', b: '15' } },
  { label: 'weak g: p = 31, g = 5', text: { p: '31', g: '5', a: '7', b: '11' } },
  { label: 'subgroup: p = 23, g = 2', text: { p: '23', g: '2', a: '6', b: '15' } },
  { label: 'composite order: p = 211, g = 4', text: { p: '211', g: '4', a: '50', b: '77' } },
  { label: 'p = 10007, g = 5', text: { p: '10007', g: '5', a: '4321', b: '8765' } },
];
const toText = (p: DhParams): Record<ParamName, string> => ({ p: String(p.p), g: String(p.g), a: String(p.a), b: String(p.b) });
const sameText = (x: Record<ParamName, string>, y: Record<ParamName, string>) => (['p', 'g', 'a', 'b'] as const).every((k) => x[k] === y[k]);

export function NumbersScene({ picker }: { picker: ReactNode }) {
  const [params, setParams] = useState<DhParams>(DEFAULTS);
  const [text, setText] = useState(toText(DEFAULTS));
  const [error, setError] = useState<string | null>(null);
  const [mitm, setMitm] = useState(false);
  const [eve, setEve] = useState<BruteForce | null>(null);
  const [digits, setDigits] = useState(DIGITS_MAX);
  const setCaption = useSetCaption();
  const phone = useMediaQuery(PHONE_QUERY);

  const x = useMemo(() => exchange(params, mitm), [params, mitm]);
  const msgs = useMemo(() => messagesFor(params, x), [params, x]);
  const frames = useMemo(() => numberFrames(params, x), [params, x]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { step, done } = player.frame;
  const strength = gStrength(params.g, params.p);
  const bSent = msgs.findIndex((m) => m.id === 'B');
  const secretTone = done ? (mitm ? 'var(--bad)' : 'var(--ok)') : undefined;

  const apply = (t = text) => {
    const r = parseParams(t);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setParams(r.value);
    setEve(null);
  };
  const load = (t: Record<ParamName, string>) => {
    setText(t);
    apply(t);
  };
  const changeMitm = (v: boolean) => {
    setMitm(v);
    setEve(null);
  };
  const tryEvery = () => {
    const r = bruteForce(params.p, params.g, x.A, x.B);
    setEve(r);
    setCaption(bruteCaption(params.p, params.a, r, x.sAlice));
  };
  const field = (k: ParamName) => (
    <TextField key={k} label={k} value={text[k]} onChange={(v) => setText({ ...text, [k]: v })} onEnter={() => apply()} width={k === 'p' ? 96 : 72} spellCheck={false} />
  );

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Alice's secret" value={done ? group(x.sAlice) : '–'} color={secretTone} />
          <Stat label="Bob's secret" value={done ? group(x.sBob) : '–'} color={secretTone} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'public value', shape: 'line' },
            { color: 'var(--violet)', label: 'private 🔒', shape: 'line' },
            { color: 'var(--ok)', label: 'shared secret', shape: 'line' },
            { color: 'var(--orange)', label: 'Eve and what she sees', shape: 'line' },
            { color: 'var(--bad)', label: 'split secrets (man in the middle)', shape: 'line' },
            { color: 'var(--hi)', label: 'the message now', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Eve" value={mitm} onChange={changeMitm} off="Listens" on="Man in the middle" />
        </>,
        <>
          {(['p', 'g', 'a', 'b'] as const).map(field)}
          <Button variant="primary" onClick={() => apply()}>Apply</Button>
          {error && <Hint tone="bad">{error} Still showing p = {group(params.p)}, g = {group(params.g)}.</Hint>}
        </>,
        <ControlGroup key="presets" label="Try">
          {PRESETS.map((pr) => (
            <ChipButton key={pr.label} on={sameText(toText(params), pr.text)} onClick={() => load(pr.text)}>
              {pr.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad dh-numbers">
        <SequenceDiagram className="dh-seq" actors={ACTORS} messages={msgs} step={step} width={phone ? undefined : DIAGRAM_W} ariaLabel="Diffie-Hellman exchange between Alice and Bob, with Eve on the wire" />
        <GNote strength={strength} p={params.p} />
        <div className="dh-eve-row">
          <Box className="dh-eve">
            <SectionTitle>Eve's notebook</SectionTitle>
            <ul>
              {eveSees(msgs, step).map((l) => <li key={l}>{l}</li>)}
              {step < 0 && <li className="dh-muted">nothing yet</li>}
            </ul>
            {mitm ? (
              <p className="dh-muted">
                Eve picked her own secrets ({group(EVE_SECRETS.toBob)} and {group(EVE_SECRETS.toAlice)}, chosen by the lesson), so she can
                compute both keys above.
              </p>
            ) : (
              <>
                <Button onClick={tryEvery} disabled={step < bSent}>Try every a</Button>
                {eve && (
                  <p>
                    x = <b className="tone-orange">{group(eve.found)}</b> after {group(eve.tries)} {eve.tries === 1 ? 'try' : 'tries'} → secret{' '}
                    <b className="tone-orange">{group(eve.secret)}</b>
                  </p>
                )}
              </>
            )}
          </Box>
          <Box className="dh-bigger">
            <SectionTitle>Bigger p</SectionTitle>
            <Slider label="Digits in p" value={digits} min={DIGITS_MIN} max={DIGITS_MAX} onChange={setDigits} format={(d) => `${d} digits`} />
            <p>
              Trying every a: about {power(digits, 10)} tries, <b>{humanDurationLog10(bruteLog10Seconds(digits))}</b> at a billion a second.
            </p>
            <p className="dh-muted">
              Extrapolated, not run. Real attacks (the number field sieve) are much faster than trying every a, which is why real DH primes
              are 2048+ bits (617 digits); 512-bit groups were broken in practice in 2015. Elliptic curves avoid those shortcuts, so
              256-bit curves suffice.
            </p>
          </Box>
        </div>
        <p className="dh-toy" role="note">{TOY_WARNING}</p>
      </div>
    </StageFrame>
  );
}

/** What the base g is worth: nothing to say for a generator, a note for a prime-order subgroup, a warning when weak. */
function GNote({ strength, p }: { strength: GInfo; p: bigint }) {
  const { order, kind, factors } = strength;
  if (kind === 'generator') {
    return (
      <p className="dh-muted">
        This g makes all {group(p - 1n)} values (a generator). Fine for a toy, but real groups avoid it: a full-group g leaks whether a is
        even or odd, so they work in a large prime-order subgroup instead.
      </p>
    );
  }
  if (kind === 'prime-subgroup') {
    return (
      <p className="dh-muted">
        This g makes {order} of the {group(p - 1n)} possible values, and {order} is prime: a prime-order subgroup, which is what real
        groups deliberately use. Fine, as long as that prime is huge.
      </p>
    );
  }
  if (kind === 'tiny') {
    return (
      <p className="dh-weak">
        This g only makes {order} distinct values, so A, B and the secret can only be one of {order} numbers and Eve's search is tiny. Real
        groups use a g whose order is a huge prime.
      </p>
    );
  }
  return (
    <p className="dh-weak">
      This g makes {order} values, but {order} = {factors.map(String).join(' × ')}: its order has only small factors, so Eve's search
      splits into small pieces, the biggest just {String(factors.at(-1))} (the Pohlig–Hellman shortcut). Real groups use a g whose order
      is a huge prime.
    </p>
  );
}
