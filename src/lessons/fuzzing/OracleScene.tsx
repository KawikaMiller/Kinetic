import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { oracleCaption, probeCaption } from './captions';
import { MAX_EXECUTIONS, MIN_EXECUTIONS, runFuzz } from './fuzzer';
import { MAX_HEX_CHARS, parseHexBytes } from './hexInput';
import { fieldsOf, nodeName } from './model';
import { PROBE_DEFAULT, initialOracle } from './opening';
import { runTarget } from './target';

const EXECUTIONS_STEP = 100;

const n = (v: number) => v.toLocaleString('en-US');

/** Scene 4: the same bug, found or silent depending on whether anything checks the read. */
export function OracleScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialOracle);
  const { seed, executions, boundsCheck, hex } = state;
  const target = useMemo(() => ({ magic: 'bytewise' as const, boundsCheck }), [boundsCheck]);
  const guided = useMemo(() => runFuzz({ kind: 'guided', seed, executions, target }), [seed, executions, target]);
  const typed = parseHexBytes(hex);
  const [lastGood, setLastGood] = useState(() => {
    const first = parseHexBytes(PROBE_DEFAULT);
    return first.ok ? first.value : [];
  });
  const probeBytes = typed.ok ? typed.value : lastGood;
  const probe = useMemo(() => runTarget(probeBytes, target), [probeBytes, target]);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const type = (text: string) => {
    const parsed = parseHexBytes(text);
    if (parsed.ok) setLastGood(parsed.value);
    set({ hex: text });
  };

  return (
    <StageFrame
      height={260}
      intro={oracleCaption(boundsCheck, guided)}
      introKey={[seed, executions, boundsCheck]}
      stats={
        <Stats>
          <Stat label="Crashes found" value={n(guided.crashes.length)} color={guided.crashes.length > 0 ? 'var(--bad)' : 'var(--muted)'} sub={`in ${n(executions)} executions`} />
          <Stat label="Over-reads" value={n(guided.overReadRuns)} color="var(--orange)" sub="executions that read past the end of their input" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'crash the fuzzer can see', shape: 'square' },
            { color: 'var(--orange)', label: 'read past the end of the input', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Reader checks bounds" value={boundsCheck} onChange={(v) => set({ boundsCheck: v })} off="Off: returns 0, carries on" on="On: throws (the stand-in for a sanitizer)" />
        </>,
        <>
          <Slider label="Executions" value={executions} min={MIN_EXECUTIONS} max={MAX_EXECUTIONS} step={EXECUTIONS_STEP} onChange={(v) => set({ executions: v })} format={n} />
          <SeedField seed={seed} onSeed={(v) => set({ seed: v })} />
        </>,
        <>
          <TextField label="Try this input (hex bytes)" value={hex} onChange={type} width={260} spellCheck={false} maxLength={MAX_HEX_CHARS + 1} />
          <Hint tone="muted" block>
            <span role="status" className="fz-status">
              {typed.ok ? null : <span className="fz-error">{typed.error} The last good input stays on show.</span>}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="fz-stage stage-pad">
        <div className="fz-block">
          <SectionTitle>The input on the toy target ({probeBytes.length} bytes)</SectionTitle>
          <ByteGrid bytes={probeBytes} perRow={8} fields={fieldsOf(probeBytes.length)} ariaLabel={`Probe input of ${probeBytes.length} bytes`} />
        </div>
        <p className="fz-note" role="status">{probeCaption(probe, boundsCheck)}</p>
        <p className="fz-note">Branches it visited: {probe.path.length > 12 ? `${probe.path.slice(0, 12).map(nodeName).join(', ')} and ${probe.path.length - 12} more` : probe.path.map(nodeName).join(', ')}.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>no real program runs: everything here is the lesson's own toy</Provenance>
        <Provenance kind="toy">the over-read is a throw in the toy reader; a native over-read is silent memory corruption, which is why sanitizers exist</Provenance>
        <Provenance kind="from-memory">AddressSanitizer and similar tools make memory errors crash at once; check each tool's documentation for what it catches</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
