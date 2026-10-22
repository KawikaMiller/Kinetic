import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram, type SequenceMessage } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { DEFAULT_PATTERN, DEFAULT_SEED, NAMES, NEEDS_SECURE, buildRun, parsePattern, pubTag, textFor } from './model';
import { headerBytes, openWith } from './realAlg';
import { TAMPER_REFUSAL, tamper, type TamperTarget } from './thief';

const PATTERN = parsePattern(DEFAULT_PATTERN);
const TEXTS = PATTERN.map((_, i) => textFor(i, []));
const ACTORS = [
  { id: 'A', label: 'Alice', tone: 'sky' as const },
  { id: 'relay', label: 'Relay', tone: 'dim' as const },
  { id: 'B', label: 'Bob', tone: 'amber' as const },
];
const TARGETS = [
  { value: 'ciphertext' as const, label: 'a ciphertext bit' },
  { value: 'tag' as const, label: 'a tag bit' },
  { value: 'header' as const, label: 'a header bit' },
];
const BIT_MAX = 127;

interface Outcome {
  message: number;
  target: TamperTarget;
  bit: number;
  opened: boolean;
}

/** Scene 3: what the relay sees, and a tampered message refused by real AES-GCM. */
export function RelayScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [which, setWhich] = useState(1);
  const [target, setTarget] = useState<TamperTarget>('ciphertext');
  const [bit, setBit] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const secure = hasSubtle();

  const run = useAsyncValue(() => buildRun(PATTERN, TEXTS, 'full', seed), `relay|${seed}`);
  const base = useAsyncValue(
    async () => (run ? (await openWith(run.messages[which - 1].mk, run.messages[which - 1].header, run.messages[which - 1].sealed)) !== null : null),
    `relay-base|${seed}|${which}|${run ? 'run' : 'wait'}`,
  );

  const press = async () => {
    if (!run) return;
    const m = run.messages[which - 1];
    const r = await tamper(m.mk, m, target, bit);
    setOutcome({ message: which, target, bit, opened: r.opened });
  };

  const messages: SequenceMessage[] = PATTERN.map((sender, i) => ({
    id: `m${i}`,
    from: sender,
    to: sender === 'A' ? 'B' : 'A',
    label: `m${i + 1}`,
    note: run ? `${run.messages[i].sealed.length} bytes` : undefined,
    tone: outcome && outcome.message === i + 1 ? (outcome.opened ? 'ok' : 'bad') : undefined,
  }));

  const shown = outcome && outcome.message === which && outcome.target === target && outcome.bit === bit ? outcome : null;
  const intro = !secure
    ? NEEDS_SECURE
    : shown
      ? shown.opened
        ? `One bit of message ${shown.message} was flipped and Bob still opened it: that should not happen.`
        : `${TAMPER_REFUSAL}. Message ${shown.message} had one bit flipped (${shown.target}, bit ${shown.bit}).`
      : 'The relay stores the header and the ciphertext, nothing else. Flip one bit and let Bob try to open the message.';

  return (
    <StageFrame
      height={620}
      intro={intro}
      introKey={`relay|${secure}|${shown ? `${shown.message}${shown.target}${shown.bit}${shown.opened}` : 'none'}`}
      stats={
        <Stats>
          <Stat label="Untampered message opens" value={base === null ? '–' : base ? 'yes' : 'no'} color={base ? 'var(--ok)' : undefined} sub={`message ${which}, real AES-GCM`} />
          <Stat label="After the flip" value={shown ? (shown.opened ? 'opened' : 'refused') : '–'} color={shown ? (shown.opened ? 'var(--bad)' : 'var(--ok)') : undefined} sub={shown ? `${shown.target}, bit ${shown.bit}` : 'press the button'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'refused: the tag does not match', shape: 'square' }, { color: 'var(--bad)', label: 'opened after a flip', shape: 'square' }, { color: 'var(--info)', label: 'the ratchet key in the header', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Slider label="Message" value={which} min={1} max={PATTERN.length} onChange={setWhich} />
          <Segmented<TamperTarget> label="Flip" options={TARGETS} value={target} onChange={setTarget} />
          <Slider label="bit" value={bit} min={0} max={BIT_MAX} onChange={setBit} />
          <Button variant="primary" onClick={press} softDisabled={!run}>Flip it and let Bob open it</Button>
        </>,
      ]}
    >
      <div className="stage-pad e2-stage">
        <table className="e2-relay" aria-label="What the relay stores for each message">
          <thead>
            <tr><th>message</th><th>sender</th><th>size</th><th>ratchet key</th><th>counter</th><th>header bytes</th></tr>
          </thead>
          <tbody>
            {run?.messages.map((m, i) => (
              <tr key={i} className={i + 1 === which ? 'is-picked' : ''}>
                <td>m{i + 1}</td>
                <td>{NAMES[m.sender]}</td>
                <td>{m.sealed.length} bytes</td>
                <td className="tone-info">{pubTag(m.header.pub)}</td>
                <td>{m.header.n}</td>
                <td>{headerBytes(m.header).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <SequenceDiagram actors={ACTORS} messages={messages} ariaLabel="The relay sees each message's size and header, never its content" />
        <p className="e2-note">
          The relay learns who talks to whom, when, and how much, but not what. Checking that the key you were given belongs to the right person (safety numbers) is a separate problem, named in <code>digital-signatures-pki</code>.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the refusal is the browser&apos;s own AES-256-GCM authentication failing</Provenance>
        <Provenance kind="simulated" seed={seed}>fictional users and a relay: a model, not a product</Provenance>
        <ClaimLabel kind="practice">end-to-end encryption does not hide metadata: who, when and how much (common practice, no product behaviour asserted)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
