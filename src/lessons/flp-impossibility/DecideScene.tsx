import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { plainTone, toneVar } from '../../core/tone';
import { integer } from '../../core/format';
import { refocusAfterRemove } from '../../core/refocus';
import { configurationView, decideCaption } from './captions';
import { livenessText, sampledText } from './checkText';
import {
  AND_TABLE, CELL_LABELS, INPUT_VECTORS, PROCS, SCENARIOS, SEED_RANGE, SEEDS_TOTAL, runSeeds, patternRows, scenarioCounts, symmetric, tryPerProcessRules, trySymmetricRules,
  type Inputs, type RuleTable,
} from './onePhase';
import { DEFAULT_SETUP, decideNow, deliverable, decisionOf, replay, sessionValency, sessionVerdict, stateOf, type Setup } from './session';

/** The sampled leg of "wait for all three": the same seeds, with and without P2 held back. */
let waitForAllSweep: { clean: ReturnType<typeof runSeeds>; crashed: ReturnType<typeof runSeeds> } | null = null;
const waitForAll = () => (waitForAllSweep ??= { clean: runSeeds('all', symmetric(AND_TABLE)), crashed: runSeeds('all', symmetric(AND_TABLE), 2) });

const MODES = [
  { value: 'one' as const, label: 'Decide on hearing one other' },
  { value: 'all' as const, label: 'Wait for all three' },
];

export function DecideScene({ picker }: { picker: ReactNode }) {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [panel, setPanel] = useState<'orders' | 'rules' | null>(null);
  const [probeProc, setProbeProc] = useState<number | null>(null);
  const change = (patch: Partial<Setup>) => {
    setSetup({ ...setup, ...patch, picks: [] });
    setProbeProc(null);
  };
  const session = useMemo(() => replay(setup), [setup]);
  const pending = useMemo(() => deliverable(session), [session]);
  const valency = useMemo(() => sessionValency(session), [session]);
  const verdict = useMemo(() => sessionVerdict(session), [session]);
  const decisions = decisionOf(session);
  const rules = useMemo(() => symmetric(setup.table), [setup.table]);
  const orders = useMemo(() => (panel === 'orders' ? patternRows(setup.inputs, rules, setup.mode) : null), [panel, setup.inputs, setup.mode, rules]);
  const counts = useMemo(() => (panel === 'orders' ? scenarioCounts(rules, setup.mode) : null), [panel, rules, setup.mode]);
  const search = useMemo(() => (panel === 'rules' ? { sym: trySymmetricRules(), per: tryPerProcessRules() } : null), [panel]);
  const done = setup.picks.length;
  const wait = useMemo(() => (setup.mode === 'all' ? waitForAll() : null), [setup.mode]);
  // Worked out from the session on every render, so the note can never outlive what it says.
  const probe = probeProc === null ? null : decideNow(session, probeProc);
  const terminal = pending.length === 0;
  const view = configurationView({ valency: valency.valency, terminal, decisions });

  const caption = decideCaption({ setup, session, valency: valency.valency, disagreementReachable: valency.disagreementReachable, verdict, decisions, terminal });
  const stats = (
    <Stats>
      <Stat label="Configuration" value={view.stat} color={view.color} sub={view.sub(valency.states)} />
      <Stat label="Disagreement reachable" value={valency.disagreementReachable ? 'yes' : 'no'} color={valency.disagreementReachable ? 'var(--bad)' : 'var(--ok)'} sub="from this configuration" />
      <Stat label="Deliveries" value={done} sub={`${pending.length} pending to pick from`} />
    </Stats>
  );

  return (
    <StageFrame
      height={460}
      stats={stats}
      intro={caption}
      introKey={`${setup.inputs.join('')}|${setup.mode}|${setup.table.join('')}|${setup.silent}|${setup.picks.join(',')}|${panel}|${probe?.text ?? ''}`}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a decided value (0 or 1 is told apart by its label)' },
            { color: 'var(--violet)', label: 'bivalent configuration' },
            { color: 'var(--info)', label: 'univalent configuration' },
            { color: 'var(--bad)', label: 'disagreement' },
            { color: 'var(--hi)', label: 'the delivery you pick next' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Protocol" options={MODES} value={setup.mode} onChange={(mode) => change({ mode, silent: null })} />
          {PROCS.map((p, i) => (
            <Toggle key={p} label={`Input ${p}`} off="0" on="1" value={setup.inputs[i] === 1} onChange={(v) => change({ inputs: setup.inputs.map((b, k) => (k === i ? (v ? 1 : 0) : b)) as unknown as Inputs })} />
          ))}
        </>,
        <>
          {setup.mode === 'one' ? (
            CELL_LABELS.map((cell, k) => (
              <Toggle key={cell} label={`D(own ${cell[0]}, heard ${cell[1]})`} off="0" on="1" value={setup.table[k] === 1} onChange={(v) => change({ table: setup.table.map((b, m) => (m === k ? (v ? 1 : 0) : b)) as unknown as RuleTable })} />
            ))
          ) : (
            <Hint>This protocol has no decision rule to edit: it decides the majority of the three inputs once it has heard them all.</Hint>
          )}
        </>,
        <>
          <Button onClick={() => setPanel('orders')}>Try every delivery order</Button>
          <Button onClick={() => setPanel('rules')}>Try every rule</Button>
          {PROCS.map((p, i) => (
            <ChipButton key={p} tone="orange" on={setup.silent === i} onClick={() => change({ silent: setup.silent === i ? null : i })}>
              {setup.silent === i ? `${p} is crashed: its messages never arrive` : `Crash ${p}`}
            </ChipButton>
          ))}
          <Button onClick={() => change({})}>Reset</Button>
          <Button onClick={() => setSetup({ ...setup, picks: setup.picks.slice(0, -1) })} softDisabled={done === 0}>Undo</Button>
        </>,
      ]}
    >
      <div className="flp-stage stage-pad">
        <div className="flp-procs">
          {PROCS.map((p, i) => {
            const s = stateOf(session, i);
            const d = decisions[i];
            const held = setup.silent === i;
            return (
              <Box key={p} className="flp-proc" style={{ '--c': toneVar(plainTone(i)) } as CSSProperties}>
                <SectionTitle hint={held ? 'crashed' : undefined}>{p}</SectionTitle>
                <div className="flp-line">input <b className="mono">{s.input}</b></div>
                <div className="flp-line">heard {s.heard.length === 0 ? <span className="flp-dim">no one yet</span> : s.heard.map(([from, v]) => `${PROCS[from]}: ${v}`).join(', ')}</div>
                <div className="flp-line">
                  {d === null ? <span className="chip tone-dim">undecided</span> : <span className="chip tone-ok">decided {d}</span>}
                </div>
                <Button onClick={() => setProbeProc(i)}>Make {p} decide now</Button>
              </Box>
            );
          })}
        </div>
        {probe && <Hint tone={probe.ok ? 'muted' : 'bad'} block>{probe.text}</Hint>}
        <Box>
          <SectionTitle hint="you are the network: pick the next message to deliver">Pending messages</SectionTitle>
          <div className="flp-pending">
            {pending.length === 0 ? <Hint block>{verdict.stuck ? `Nothing left to deliver: ${verdict.undecided.join(' and ')} did not decide within ${done} deliveries.` : 'Everything that can arrive has arrived.'}</Hint> : null}
            {pending.map((t, k) => (
              <ChipButton
                key={t.label.text}
                tone="hi"
                onClick={(e) => {
                  refocusAfterRemove(e.currentTarget, { group: '.flp-pending', fallback: '.flp-procs button' });
                  setSetup({ ...setup, picks: [...setup.picks, k] });
                }}
              >
                {t.label.message!.from} to {t.label.message!.to}: carries {t.label.message!.payload.value}
              </ChipButton>
            ))}
          </div>
          {wait && (
            <Hint block>
              Sampled: waiting for all three {sampledText(SEEDS_TOTAL - wait.clean.failing.length, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1)}. With P2 held back for the whole run, {livenessText(wait.crashed.undecided, SEEDS_TOTAL, 'the end of the run')}: that is what waiting costs.
            </Hint>
          )}
          <div className="flp-verdict">
            <span className={`chip ${view.tone}`}>{view.chip}</span>
            {verdict.broken && <span className="chip tone-bad">{verdict.broken}</span>}
          </div>
        </Box>
        {orders && counts && (
          <Box>
            <SectionTitle hint={`all ${orders.length} ways each process can hear one other first, for inputs ${setup.inputs.join(' ')}`}>Every delivery order (exhaustive, 3 processes, one round)</SectionTitle>
            <table className="data-table">
              <thead><tr><th>P0 hears</th><th>P1 hears</th><th>P2 hears</th><th>decisions</th><th>verdict</th></tr></thead>
              <tbody>
                {orders.map((r) => (
                  <tr key={r.pattern}>
                    {r.heardFirst.map((h, i) => <td key={i}>{h}</td>)}
                    <td>{r.decisions.join(' ')}</td>
                    <td>{r.verdict.agree && r.verdict.valid ? <span className="chip tone-ok">agree</span> : <span className="chip tone-bad">{r.verdict.agree ? 'invalid' : 'disagree'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Hint block>
              {orders.filter((r) => !r.verdict.agree).length} of {orders.length} delivery orders break agreement for these inputs; across all {INPUT_VECTORS.length} input vectors, {counts.disagree} of {integer(SCENARIOS)} scenarios do.
            </Hint>
          </Box>
        )}
        {search && (
          <Box>
            <SectionTitle hint="exhaustive: every rule below against all 64 scenarios">Every decision rule</SectionTitle>
            {setup.mode === 'all' ? (
              <Hint block>Waiting for all three has no rule to vary. It agrees on all {SCENARIOS} scenarios, and the Crash buttons show what it pays for that.</Hint>
            ) : (
              <>
                <div className="flp-line"><b className="mono">{search.sym.safe} of {search.sym.rules}</b> symmetric rules D(own, heard) agree and keep validity: {search.sym.agreeing} agree, {search.sym.valid} are valid, none is both.</div>
                <div className="flp-line"><b className="mono">{search.per.safe} of {integer(search.per.rules)}</b> per-process rules (validity pinned, 12 free bits) agree on all {SCENARIOS} scenarios.</div>
                <Hint block>This is the bounded instance, for one round and three processes. It is not the theorem: the theorem covers every deterministic protocol, however many rounds.</Hint>
              </>
            )}
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">three processes, binary inputs, one round of news</Provenance>
          <Provenance kind="from-memory">Fischer, Lynch and Paterson, 1985; check the paper for the exact statement</Provenance>
          <ClaimLabel kind="theorem">FLP: no deterministic protocol guarantees both agreement and termination when delays are unbounded and one process may crash (argued, not run here)</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
