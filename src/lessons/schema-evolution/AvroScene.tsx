import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, Segmented, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { ByteField } from '../../core/bytes';
import { plainTone } from '../../core/tone';
import {
  ATYPES, LESSON_HISTORY, MODES, NARROWING_HISTORY, PROMOTION_HISTORY, avroLines, defaultValue, encodeRecord, nameProblem, register, sampleRecord, sampleValue,
  type AType, type ASchema, type Mode, type PairCheck,
} from './avro';
import { avroCaption } from './captions';

const PRESETS: { label: string; history: ASchema[] }[] = [
  { label: 'The lesson example', history: LESSON_HISTORY },
  { label: 'Widening: int, long, double', history: PROMOTION_HISTORY },
  { label: 'Narrowing: long to int', history: NARROWING_HISTORY },
];
const copy = (h: readonly ASchema[]): ASchema[] => h.map((s) => s.map((f) => ({ ...f })));
const VERSIONS = [0, 1, 2].map((i) => ({ value: i, label: `v${i + 1}` }));
const MODE_OPTIONS = MODES.map((m) => ({ value: m, label: m }));

const showValue = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const showRecord = (r: Record<string, unknown>) => `{ ${Object.entries(r).map(([k, v]) => `${k}: ${showValue(v)}`).join(', ')} }`;

export function AvroScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [history, setHistory] = useState<ASchema[]>(() => copy(LESSON_HISTORY));
  const [sel, setSel] = useState(0);
  const [mode, setMode] = useState<Mode>('BACKWARD');
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState<AType>('int');

  const schema = history[sel];
  const problem = draft === '' ? null : nameProblem(draft, schema);
  const caption = useMemo(() => avroCaption(mode, history), [mode, history]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const edit = (change: (s: ASchema) => ASchema) => setHistory((h) => h.map((s, i) => (i === sel ? change(s) : s)));
  const add = () => {
    if (draft === '' || problem) return;
    edit((s) => [...s, { name: draft, type: draftType, hasDefault: false }]);
    setDraft('');
  };
  const load = (h: readonly ASchema[]) => {
    setHistory(copy(h));
    setSel(0);
  };

  const sample = useMemo(() => encodeRecord(schema, sampleRecord(schema)), [schema]);
  const fields = useMemo(
    () => sample.segments.map((s, i): ByteField => ({ from: s.from, to: s.to, tone: plainTone(i), label: `${s.field} = ${showValue(sampleValue(schema[i].type))}` })),
    [sample, schema],
  );
  const registrations = useMemo(() => [1, 2].map((n) => register(mode, history, n)), [mode, history]);

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'compatible, or decoded' },
            { color: 'var(--bad)', label: 'refused, or a decode error' },
            { color: 'var(--orange)', label: 'rules and decode disagree (cannot happen here: the tests prove it)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="se-chips" role="group" aria-label="Version histories">
            {PRESETS.map((p) => <ChipButton key={p.label} tone="info" onClick={() => load(p.history)}>{p.label}</ChipButton>)}
          </div>
        </>,
        <>
          <Segmented label="Registry mode" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        </>,
        <>
          <Segmented label="Edit version" value={sel} onChange={setSel} options={VERSIONS} />
        </>,
      ]}
    >
      <div className="stage-pad se">
        <div className="se-pair">
          <Box className="se-editor">
            <SectionTitle weight="regular" hint={`${schema.length} of 8 fields`}>{`Schema v${sel + 1}`}</SectionTitle>
            <ul className="se-fields">
              {schema.map((f, i) => (
                <li key={f.name} className="se-frow">
                  <code>{f.name}</code>
                  <select
                    className="se-select"
                    aria-label={`Type of ${f.name}`}
                    value={f.type}
                    onChange={(e) => edit((s) => s.map((x, j) => (j === i ? { ...x, type: e.target.value as AType } : x)))}
                  >
                    {ATYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChipButton tone="info" on={f.hasDefault} ariaLabel={`${f.name} has a default`} onClick={() => edit((s) => s.map((x, j) => (j === i ? { ...x, hasDefault: !x.hasDefault } : x)))}>
                    {f.hasDefault ? `default ${showValue(defaultValue(f.type))}` : 'no default'}
                  </ChipButton>
                  <ChipButton tone="bad" ariaLabel={`Remove ${f.name}`} onClick={() => edit((s) => s.filter((_, j) => j !== i))}>remove</ChipButton>
                </li>
              ))}
              {schema.length === 0 && <li className="empty-note">An empty record is allowed: it is zero bytes.</li>}
            </ul>
            <div className="se-add">
              <TextField label="New field" value={draft} onChange={setDraft} onEnter={add} width={140} spellCheck={false} maxLength={24} />
              <select className="se-select" aria-label="Type of the new field" value={draftType} onChange={(e) => setDraftType(e.target.value as AType)}>
                {ATYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <Button onClick={add} disabled={draft === '' || problem !== null}>Add field</Button>
            </div>
            {problem && <span className="se-error" role="alert">{problem}</span>}
          </Box>
          <div className="se-schema">
            <CodePanel title={`v${sel + 1} as Avro JSON`} lines={avroLines(schema)} gutter="none" />
            <SectionTitle weight="regular" hint={`${sample.bytes.length} bytes, no field names or schema in them`}>A sample record, written with it</SectionTitle>
            {sample.bytes.length ? <ByteGrid bytes={sample.bytes} fields={fields} ariaLabel={`Sample record written with v${sel + 1}`} /> : <p className="empty-note">Zero bytes.</p>}
          </div>
        </div>

        <div className="se-regs">
          {registrations.map((r) => (
            <Box key={r.version} className="se-reg">
              <div className="se-card-head">
                <SectionTitle weight="regular">{`Register v${r.version + 1} under ${mode}`}</SectionTitle>
                <span className={`chip tone-${r.accepted ? 'ok' : 'bad'}`}>{r.accepted ? 'accepted' : 'refused'}</span>
              </div>
              {r.checks.length === 0 && <p className="empty-note">{mode === 'NONE' ? 'NONE checks nothing.' : 'Nothing earlier to check.'}</p>}
              <ul className="se-checks">
                {r.checks.map((c) => <PairRow key={`${c.reader}-${c.writer}`} check={c} version={r.version} />)}
              </ul>
            </Box>
          ))}
        </div>
        <div className="se-chips">
          <Provenance kind="real">the Avro encoder, resolution and round trips run here</Provenance>
          <Provenance kind="from-memory">the mode names and BACKWARD as the default are Confluent Schema Registry's</Provenance>
        </div>
        <Hint block>
          The registry column applies the specification's resolution rules to the two schemas; the real column writes sample bytes with the writer and reads them with the reader. They should always agree.
          Defaults here are the type's zero value, and only flat records are modelled.
        </Hint>
      </div>
    </StageFrame>
  );
}

function PairRow({ check, version }: { check: PairCheck; version: number }) {
  const rulesOk = check.problems.length === 0;
  const direction = check.reader === version ? 'backward' : 'forward';
  return (
    <li className="se-check">
      <b>{`v${check.reader + 1} reads v${check.writer + 1} data`}</b> <span className="muted">({direction})</span>
      <div className="se-check-results">
        <span className={`chip tone-${rulesOk ? 'ok' : 'bad'} wrap`}>{rulesOk ? 'rules: compatible' : `rules: ${check.problems[0]}`}</span>
        <span className={`chip tone-${check.real.ok ? 'ok' : 'bad'} wrap`}>{check.real.ok ? `decoded ${showRecord(check.real.value)}` : `error: ${check.real.error}`}</span>
        {!check.agree && <span className="chip tone-orange">they disagree</span>}
      </div>
    </li>
  );
}
