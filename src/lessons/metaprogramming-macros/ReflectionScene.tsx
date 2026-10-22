import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { reflectionCaption } from './captions';
import { EXTRA, FIELD_IDS, PROBES, generate, handWritten, objectWith, probe, reflective, trapText, type FieldId, type ProbeResult, type ProbeSpec } from './reflection';

interface Probed {
  spec: ProbeSpec;
  result: ProbeResult;
}

/** The object as the definition the developer wrote: one line per field, added fields tinted. */
function definitionLines(added: readonly FieldId[]): string[] {
  const fields = [`name: 'Ada'`, 'age: 36', ...added.map((f) => `${f}: ${JSON.stringify(EXTRA[f])}`)];
  return ['const obj = {', ...fields.map((f, i) => `  ${f}${i < fields.length - 1 ? ',' : ''}`), '};'];
}

/** Scene 2: real JavaScript on fixed code: a Proxy over an object, and three serialisers for it. */
export function ReflectionScene({ picker }: { picker: ReactNode }) {
  const [added, setAdded] = useState<FieldId[]>([]);
  const [generatedFor, setGeneratedFor] = useState<FieldId[]>([]);
  const [edited, setEdited] = useState<FieldId[]>([]);
  const [probed, setProbed] = useState<Probed | null>(null);
  const obj = useMemo(() => objectWith(added), [added]);
  const truth = JSON.stringify(obj);
  const outputs = useMemo(
    () => [
      { id: 'reflective', label: 'Reflective: walks the keys at run time', text: reflective(obj), fix: null as string | null },
      { id: 'generated', label: 'Generated: field list fixed at build time', text: generate(objectWith(generatedFor)).serialise(obj), fix: 'Regenerate' },
      { id: 'hand', label: 'Hand-written: each field named in the code', text: handWritten(edited)(obj), fix: 'Edit by hand' },
    ],
    [obj, generatedFor, edited],
  );
  const stale = outputs.filter((o) => o.text !== truth).length;
  const nextToEdit = added.find((f) => !edited.includes(f));

  const run = (spec: ProbeSpec) => setProbed({ spec, result: probe(spec, obj) });
  const reset = () => {
    setAdded([]);
    setGeneratedFor([]);
    setEdited([]);
    setProbed(null);
  };

  return (
    <StageFrame
      height={560}
      intro={reflectionCaption({ probe: probed?.result ?? null, spec: probed?.spec ?? null, stale, added })}
      introKey={`${probed ? `${probed.spec.id}|${probed.result.value}` : 'none'}|${stale}|${added.join(',')}`}
      stats={
        <Stats>
          <Stat label="Fields" value={Object.keys(obj).length} color="var(--info)" sub={`${Object.keys(obj).join(', ')}`} />
          <Stat label="Stale serialisers" value={stale} color={stale ? 'var(--orange)' : 'var(--ok)'} sub="output differs from JSON.stringify" />
          <Stat label="Traps fired" value={probed ? probed.result.log.length : 0} color="var(--hi)" sub="by the last probe" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a Proxy trap that fired', shape: 'square' },
            { color: 'var(--orange)', label: 'stale: missing the new field', shape: 'square' },
            { color: 'var(--ok)', label: 'matches JSON.stringify', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Probe the object through a Proxy">
            {PROBES.map((p) => (
              <ChipButton key={p.id} tone="info" on={probed?.spec.id === p.id} onClick={() => run(p)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <ControlGroup label="Add a field to the definition">
            {FIELD_IDS.map((f) => (
              <ChipButton key={f} tone="orange" softDisabled={added.includes(f)} onClick={() => {
                  setAdded([...added, f]);
                  setProbed(null);
                }}>
                {f}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="mm-stage stage-pad">
        <div className="mm-two">
          <CodePanel title="The object" lines={definitionLines(added)} stateOf={(i) => (i >= 3 && i < 3 + added.length ? 'add' : 'idle')} />
          <div className="mm-probe">
            <SectionTitle>What the Proxy saw</SectionTitle>
            <ConsolePanel
              title="proxy traps"
              lines={probed ? [{ text: probed.spec.code, tone: 'muted' as const }, ...probed.result.log.map((e) => ({ text: trapText(e), tone: 'hi' as const })), `returned ${probed.result.value}`] : []}
              empty="Pick a probe above."
            />
          </div>
        </div>
        <SectionTitle>Three serialisers, one object</SectionTitle>
        <table className="data-table mm-serialisers">
          <thead>
            <tr>
              <th>Serialiser</th>
              <th>Output</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((o) => {
              const ok = o.text === truth;
              return (
                <tr key={o.id}>
                  <td>{o.label}</td>
                  <td>
                    <code>{o.text}</code>
                  </td>
                  <td className={ok ? 'mm-ok' : 'mm-stale'}>
                    {ok ? 'matches' : 'stale'}{' '}
                    {!ok && o.fix ? (
                      <Button
                        onClick={() => (o.id === 'generated' ? setGeneratedFor(added) : nextToEdit && setEdited([...edited, nextToEdit]))}
                        softDisabled={o.id === 'hand' && !nextToEdit}
                      >
                        {o.fix}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mm-note">
          JSON.stringify of the object: <code>{truth}</code>. A reflective version reads the object as it is now; a generated or hand-written one is only as current as the last time someone regenerated or edited it.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">a real Proxy and Reflect over fixed lesson code, run in your browser: nothing you click is evaluated as code</Provenance>
        <Provenance kind="toy">the three serialisers are small stand-ins; ORMs and dependency-injection containers commonly use reflection or proxies (from memory)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
