import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram, type SequenceMessage } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import {
  DEFAULT_PATTERN, DEFAULT_SEED, MAX_MESSAGES, NAMES, NEEDS_SECURE, TEXT_LIMIT, analyse, buildRun, clampText, parsePattern, pubTag, textFor, triesText,
} from './model';
import { MarkRow, ModeComparison } from './parts';
import type { Party } from './ratchet';

const ACTORS = [
  { id: 'A', label: 'Alice', tone: 'sky' as const },
  { id: 'relay', label: 'Relay', tone: 'dim' as const },
  { id: 'B', label: 'Bob', tone: 'amber' as const },
];
const PARTY_OPTIONS = [
  { value: 'A' as const, label: "Alice's state" },
  { value: 'B' as const, label: "Bob's state" },
];
const DEFAULT_K = 1;

interface Entry {
  sender: Party;
  text: string | undefined;
}
const initial = (): Entry[] => parsePattern(DEFAULT_PATTERN).map((sender) => ({ sender, text: undefined }));

/** Scene 2: turning the Diffie-Hellman ratchet. Edit the conversation, steal a party's state, and see which messages read and where it heals. */
export function HealScene({ picker }: { picker: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [party, setParty] = useState<Party>('A');
  const [stolenAfter, setStolenAfter] = useState(DEFAULT_K);
  const [draft, setDraft] = useState('');
  const secure = hasSubtle();

  const pattern = useMemo(() => entries.map((e) => e.sender), [entries]);
  const texts = useMemo(() => entries.map((_, i) => textFor(i, entries.map((x) => x.text))), [entries]);
  const k = Math.min(stolenAfter, pattern.length);
  const key = `heal|${pattern.join('')}|${texts.join('|')}|${seed}`;

  const run = useAsyncValue(() => (pattern.length ? buildRun(pattern, texts, 'full', seed) : Promise.resolve(null)), key);
  const analysis = useAsyncValue(() => (run && k >= 1 ? analyse(run, pattern, 'full', party, k, seed) : Promise.resolve(null)), `${key}|${party}|${k}|${run ? 'run' : 'wait'}`);

  const add = (sender: Party) => {
    if (entries.length >= MAX_MESSAGES) return;
    setEntries([...entries, { sender, text: draft.trim() ? draft : undefined }]);
    setDraft('');
  };

  const messages: SequenceMessage[] = pattern.map((sender, i) => {
    const before = i < k;
    const readable = analysis?.readable[i] ?? false;
    const header = run?.messages[i]?.header;
    return {
      id: `m${i}`,
      from: sender,
      to: sender === 'A' ? 'B' : 'A',
      label: `m${i + 1}${header ? ` key ${pubTag(header.pub)} #${header.n}` : ''}`,
      tone: analysis === null ? undefined : before ? 'dim' : readable ? 'bad' : 'ok',
      note: analysis === null ? undefined : before ? 'before the theft' : readable ? 'readable' : 'sealed',
    };
  });

  const healing = analysis?.healing ?? null;
  const intro = !secure
    ? NEEDS_SECURE
    : pattern.length === 0
      ? 'The conversation is empty: add messages from Alice or Bob.'
      : analysis === null
        ? 'Running the ratchet with real HKDF and AES-GCM...'
        : healing === null
          ? k === pattern.length
            ? `The state was copied after the last message: nothing is left to read.`
            : `${NAMES[party]}'s state after message ${k} reads every later message: no fresh key was made after the theft, so nothing heals.`
          : `${NAMES[party]}'s state after message ${k}: message ${healing + 1} is the first one sealed to the thief, because its chain depends on a key made after the theft.`;

  return (
    <StageFrame
      height={640}
      intro={intro}
      introKey={`heal|${secure}|${pattern.join('')}|${party}|${k}|${healing}|${analysis === null}`}
      stats={
        <Stats>
          <Stat label="Readable" value={analysis ? analysis.readable.filter(Boolean).length : '–'} color="var(--bad)" sub={`of ${pattern.length} messages`} />
          <Stat label="Healing point" value={analysis ? (healing === null ? 'none' : `message ${healing + 1}`) : '–'} color={healing === null ? undefined : 'var(--hi)'} sub={healing === null ? 'no reply made a fresh key' : 'first sealed after the theft'} />
          <Stat label="Closure vs replay" value={analysis ? (analysis.agree ? 'agree' : 'differ') : '–'} color={analysis ? (analysis.agree ? 'var(--ok)' : 'var(--bad)') : undefined} sub="two independent computations" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'sealed to the thief', shape: 'square' },
            { color: 'var(--bad)', label: 'readable by the thief', shape: 'square' },
            { color: 'var(--info)', label: 'the ratchet key on the wire', shape: 'square' },
            { color: 'var(--hi)', label: 'the healing point', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <ControlGroup label="Add a message">
            <ChipButton tone="sky" softDisabled={entries.length >= MAX_MESSAGES} onClick={() => add('A')}>from Alice</ChipButton>
            <ChipButton tone="amber" softDisabled={entries.length >= MAX_MESSAGES} onClick={() => add('B')}>from Bob</ChipButton>
            <ChipButton onClick={() => setEntries(entries.slice(0, -1))} softDisabled={entries.length === 0}>remove last</ChipButton>
            <ChipButton onClick={() => setEntries([])}>clear</ChipButton>
            <ChipButton onClick={() => setEntries(initial())}>reset</ChipButton>
          </ControlGroup>
          <TextField label={`Next message text (up to ${TEXT_LIMIT} characters, demo only)`} value={draft} onChange={(v) => setDraft(clampText(v))} width={220} maxLength={TEXT_LIMIT} spellCheck={false} />
          {entries.length >= MAX_MESSAGES && <Hint tone="muted">The conversation is full at {MAX_MESSAGES} messages.</Hint>}
        </>,
        <>
          <Segmented<Party> label="Steal" options={PARTY_OPTIONS} value={party} onChange={setParty} />
          {pattern.length > 0 ? <Slider label="after message" value={k} min={1} max={pattern.length} onChange={setStolenAfter} /> : <Hint tone="muted">Add a message to choose a theft point.</Hint>}
          <Button onClick={() => setStolenAfter(DEFAULT_K)}>First message</Button>
        </>,
      ]}
    >
      <div className="stage-pad e2-stage">
        {pattern.length > 0 && (
          <SequenceDiagram actors={ACTORS} messages={messages} ariaLabel="Messages between Alice and Bob through a relay that sees only headers and ciphertext" />
        )}
        <MarkRow pattern={pattern} k={Math.max(k, 0)} analysis={analysis} />
        <ul className="e2-tries" aria-label="Real AES-GCM attempts on the messages sent before the theft">
          {analysis?.tries.slice(0, k).map((t, i) => (
            <li key={i}>m{i + 1}: {triesText(t)}</li>
          ))}
        </ul>
        {pattern.length > 0 && <ModeComparison pattern={pattern} party={party} k={k} />}
        <p className="e2-note">A stolen key here is a state in a simulation of fictional users: there is no recovery procedure for anything real. Never type a real secret into a demo; nothing is stored.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">HKDF-SHA256, HMAC-SHA256 and AES-256-GCM from Web Crypto; P-256 from this page&apos;s own arithmetic, cross-checked against node:crypto in the tests</Provenance>
        <Provenance kind="simulated" seed={seed}>fictional users and a simulated theft: a model, not a forensic tool</Provenance>
        <Provenance kind="toy">simplified, in the spirit of Signal&apos;s double ratchet, not compatible with it, not constant-time, seeded keys: demo only</Provenance>
        <ClaimLabel kind="theorem">forward secrecy and healing hold in this model for the keys tried: argued from the derivation rules, checked on 256 patterns, not proved for the real protocol</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
