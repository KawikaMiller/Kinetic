import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { hasSubtle } from '../../core/crypto';
import { useAsyncValue } from '../../core/useAsyncValue';
import { CHAIN_MESSAGES, DEFAULT_SEED, NEEDS_SECURE, PROTECTION_LABEL, hex, parsePattern, textFor, triesText, analyse, buildRun, type Protection } from './model';
import { ModeComparison, MarkRow } from './parts';

const CHAIN_PATTERN = parsePattern('A'.repeat(CHAIN_MESSAGES));
const CHAIN_TEXTS = CHAIN_PATTERN.map((_, i) => textFor(i, []));
const PROTECTION_OPTIONS = (['fixed', 'symmetric', 'full'] as const).map((value) => ({ value, label: PROTECTION_LABEL[value] }));
const DEFAULT_K = 2;

/** Scene 1: one key per message. Eight messages one way, a chain strip, and a thief who copies the sender's state after message k. */
export function ChainScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [protection, setProtection] = useState<Protection>('symmetric');
  const [k, setK] = useState(DEFAULT_K);
  const secure = hasSubtle();
  const runMode = protection === 'full' ? 'full' : 'symmetric';

  const run = useAsyncValue(() => buildRun(CHAIN_PATTERN, CHAIN_TEXTS, runMode, seed), `chain|${runMode}|${seed}`);
  const analysis = useAsyncValue(() => (run ? analyse(run, CHAIN_PATTERN, protection, 'A', k, seed) : Promise.resolve(null)), `chain|${protection}|${seed}|${k}|${run ? 'run' : 'wait'}`);

  const readableCount = analysis ? analysis.readable.filter(Boolean).length : null;
  const intro = !secure
    ? NEEDS_SECURE
    : analysis === null
      ? 'Deriving the keys and trying them with real AES-GCM...'
      : `The thief copies Alice's state after message ${k} and can read ${readableCount} of the ${CHAIN_MESSAGES} messages (${PROTECTION_LABEL[protection].toLowerCase()}). Each earlier message was tried with ${analysis.candidates} derivable key${analysis.candidates === 1 ? '' : 's'}: ${analysis.tries.slice(0, k).every((t) => t.openedBy === null) ? '0 opened' : 'some opened'}.`;

  return (
    <StageFrame
      height={560}
      intro={intro}
      introKey={`chain|${secure}|${protection}|${k}|${readableCount}`}
      stats={
        <Stats>
          <Stat label="Readable by the thief" value={readableCount === null ? '–' : `${readableCount} of ${CHAIN_MESSAGES}`} color={readableCount ? 'var(--bad)' : 'var(--ok)'} sub={`state copied after message ${k}`} />
          <Stat label="Keys tried per earlier message" value={analysis ? analysis.candidates : '–'} sub="every key derivable from the copied state, real AES-GCM" />
          <Stat label="Opened an earlier message" value={analysis ? analysis.tries.slice(0, k).filter((t) => t.openedBy).length : '–'} color={analysis && analysis.tries.slice(0, k).some((t) => t.openedBy) ? 'var(--bad)' : 'var(--ok)'} sub="in this model" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'sealed to the thief', shape: 'square' },
            { color: 'var(--bad)', label: 'readable by the thief', shape: 'square' },
            { color: 'var(--violet)', label: 'the chain (structure)', shape: 'square' },
            { color: 'var(--hi)', label: 'the message key in use', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Segmented<Protection> label="Protection" options={PROTECTION_OPTIONS} value={protection} onChange={setProtection} />
          <Slider label="Steal Alice's state after message" value={k} min={1} max={CHAIN_MESSAGES} onChange={setK} />
        </>,
      ]}
    >
      <div className="stage-pad e2-stage">
        {run && protection !== 'fixed' && (
          <div className="e2-chain" role="list" aria-label="The chain: one message key per message">
            {run.messages.map((m, i) => (
              <div key={i} role="listitem" className="e2-chain-card">
                <b>message {i + 1}</b>
                <span className="e2-mk">MK {hex(m.mk)}</span>
                <span className="e2-ck">CK {hex(m.ckAfter)}</span>
              </div>
            ))}
          </div>
        )}
        {protection === 'fixed' && <p className="e2-note">One AES-256-GCM key for the whole chat, the message counter as the nonce: there is no chain, so there is nothing to turn.</p>}
        <MarkRow pattern={CHAIN_PATTERN} k={k} analysis={analysis} />
        <ul className="e2-tries" aria-label="Real AES-GCM attempts on the messages sent before the theft">
          {analysis?.tries.slice(0, k).map((t, i) => (
            <li key={i}>m{i + 1}: {triesText(t)}{t.openedBy ? ` (${t.openedBy})` : ''}</li>
          ))}
        </ul>
        <ModeComparison pattern={CHAIN_PATTERN} party="A" k={k} />
        <p className="e2-note">
          The relay and both users are fictional, the seeds are visible and a real app uses a CSPRNG (see <code>randomness-csprng</code>). Never type a real secret into a demo. The theft is a derivation rule over a simulated state, not a procedure.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">HMAC-SHA256, HKDF-SHA256 and AES-256-GCM run in this browser through Web Crypto</Provenance>
        <Provenance kind="simulated" seed={seed}>fictional users and a simulated theft: a model, not a forensic tool</Provenance>
        <Provenance kind="toy">simplified, in the spirit of Signal&apos;s double ratchet, not compatible with it, not constant-time, seeded keys: demo only</Provenance>
        <Provenance kind="from-memory">HMAC with the constants 0x01 and 0x02 for the chain step is the shape the Signal specification describes (verify against that specification)</Provenance>
        <ClaimLabel kind="practice">end-to-end encryption hides message content from the relay, not who talks to whom, when, or how much</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
