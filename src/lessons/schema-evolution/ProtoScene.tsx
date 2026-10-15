import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, Segmented, TextField, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import type { ByteField } from '../../core/bytes';
import type { Tone } from '../../core/tone';
import { protoCaption } from './captions';
import {
  CHANGES, DEFAULT_PARAMS, V1, crossBoth, parseFieldNumber, protoLines, type ChangeId, type ChangeParams, type Format, type FindingKind, type Reading, type Verdict,
} from './proto';

type Side = 'v1' | 'v2';
const FORMATS: { value: Format; label: string }[] = [
  { value: 'binary', label: 'Binary' },
  { value: 'json', label: 'JSON' },
];
const SIDES: { value: Side; label: string }[] = [
  { value: 'v1', label: 'v1 writer' },
  { value: 'v2', label: 'v2 writer' },
];

const VERDICT_TONE: Record<Verdict, Tone> = { ok: 'ok', lossy: 'orange', error: 'bad' };
const VERDICT_LABEL: Record<Verdict, string> = { ok: 'read correctly', lossy: 'read wrongly, no error', error: 'error' };
const FINDING_TONE: Record<FindingKind, Tone> = { ok: 'ok', lossy: 'orange', error: 'bad', unknown: 'dim' };
const ROLE_TONE: Record<'tag' | 'length' | 'value', Tone> = { tag: 'violet', length: 'info', value: 'muted' };

/** Lines present in one schema and not the other: removed lines are `del` in v1, added ones `add` in v2. */
const diffStates = (own: readonly string[], other: readonly string[], mark: LineState) => (i: number): LineState =>
  i > 0 && i < own.length - 1 && !other.includes(own[i]) ? mark : 'idle';

export function ProtoScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [change, setChange] = useState<ChangeId>('add');
  const [params, setParams] = useState<ChangeParams>(DEFAULT_PARAMS);
  const [numberText, setNumberText] = useState(String(DEFAULT_PARAMS.number));
  const [numberError, setNumberError] = useState<string | null>(null);
  const [format, setFormat] = useState<Format>('binary');
  const [strictJson, setStrictJson] = useState(true);
  const [side, setSide] = useState<Side>('v1');

  const spec = CHANGES.find((c) => c.id === change)!;
  const { evolved, crossing } = useMemo(() => crossBoth(change, params, format, strictJson), [change, params, format, strictJson]);
  const caption = useMemo(() => protoCaption(change, params, format, strictJson), [change, params, format, strictJson]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const editNumber = (text: string) => {
    setNumberText(text);
    const r = parseFieldNumber(text, V1.fields);
    setNumberError(r.ok ? null : r.error);
    if (r.ok) setParams((p) => ({ ...p, number: r.value }));
  };

  const v1Lines = protoLines(V1);
  const v2Lines = evolved.schema ? protoLines(evolved.schema) : [];
  const shown = crossing && (side === 'v1' ? crossing.oldToNew : crossing.newToOld);

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'tag byte' },
            { color: 'var(--info)', label: 'length byte' },
            { color: 'var(--muted)', label: 'value byte' },
            { color: 'var(--dim)', label: 'skipped as unknown' },
            { color: 'var(--ok)', label: 'read correctly' },
            { color: 'var(--orange)', label: 'read wrongly, no error' },
            { color: 'var(--bad)', label: 'error' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="se-chips" role="group" aria-label="The change">
            {CHANGES.map((c) => (
              <ChipButton key={c.id} tone="info" on={change === c.id} onClick={() => setChange(c.id)}>{c.label}</ChipButton>
            ))}
          </div>
        </>,
        <>
          {spec.usesNumber && (
            <span className="se-field">
              <TextField label="Field number" value={numberText} onChange={editNumber} width={110} spellCheck={false} />
              {numberError && <span className="se-error" role="alert">{numberError}</span>}
            </span>
          )}
          {spec.usesReserved && (
            <Toggle label="Reserve the number 3" value={params.reserved} onChange={(reserved) => setParams((p) => ({ ...p, reserved }))} off="no line" on="reserved 3;" />
          )}
          <Segmented label="Encoding" value={format} onChange={setFormat} options={FORMATS} />
          {format === 'json' && <Toggle label="JSON reader" value={!strictJson} onChange={(lenient) => setStrictJson(!lenient)} off="refuses unknown names" on="ignores unknown names" />}
        </>,
      ]}
    >
      <div className="stage-pad se">
        <div className="se-pair">
          <CodePanel title="v1 (everyone runs this today)" lines={v1Lines} gutter="none" stateOf={diffStates(v1Lines, v2Lines, 'del')} />
          {evolved.schema ? (
            <CodePanel title="v2 (after your change)" lines={v2Lines} gutter="none" stateOf={diffStates(v2Lines, v1Lines, 'add')} />
          ) : (
            <Box className="se-refused" role="alert">
              <SectionTitle weight="regular">v2 does not compile</SectionTitle>
              <p>{evolved.refusal}</p>
            </Box>
          )}
        </div>

        {crossing && (
          <>
            <div className="se-readings">
              <ReadingCard title="v1 writer, v2 reader" reading={crossing.oldToNew} />
              <ReadingCard title="v2 writer, v1 reader" reading={crossing.newToOld} />
            </div>
            <div className="se-wire">
              <SectionTitle weight="regular" hint={format === 'binary' ? 'the bytes on the wire' : 'the JSON text on the wire'}>What was written</SectionTitle>
              <Segmented ariaLabel="Whose message to show" value={side} onChange={setSide} options={SIDES} />
              {shown && format === 'binary' && <Bytes reading={shown} />}
              {shown && format === 'json' && <code className="se-json">{shown.json}</code>}
            </div>
          </>
        )}
        {spec.caution && format === 'binary' && <Hint block>{spec.caution}</Hint>}
        <div className="se-chips">
          <Provenance kind="real">encoders and decoders are this lesson's own, run here on real bytes</Provenance>
          <Provenance kind="from-memory">JSON names, the 19000-19999 range, protoc's refusal, parser strictness</Provenance>
        </div>
        <Hint block>
          A reader that meets a known number with the wrong wire type is shown skipping it as unknown; implementations differ here (from memory), so treat that row as one common behaviour, not a promise.
          {' '}A row is "read wrongly" when a field's value differs from what the writer meant for it, whether or not anything raised an error.
        </Hint>
      </div>
    </StageFrame>
  );
}

function ReadingCard({ title, reading }: { title: string; reading: Reading }) {
  const tone = VERDICT_TONE[reading.verdict];
  return (
    <Box className="se-card">
      <div className="se-card-head">
        <SectionTitle weight="regular">{title}</SectionTitle>
        <span className={`chip tone-${tone}`}>{VERDICT_LABEL[reading.verdict]}</span>
      </div>
      <code className="se-decoded">{reading.shown}</code>
      <ul className="se-findings">
        {reading.findings.map((f, i) => (
          <li key={i} className={`log-row tone-${FINDING_TONE[f.kind]}`}>{f.text}</li>
        ))}
      </ul>
    </Box>
  );
}

function Bytes({ reading }: { reading: Reading }) {
  const fields = useMemo(() => {
    const unknown = (i: number) => reading.unknown.some((u) => i >= u.from && i <= u.to);
    return reading.segments
      .filter((s) => !unknown(s.from))
      .map((s): ByteField => ({ from: s.from, to: s.to, tone: ROLE_TONE[s.role], label: `${s.concept} ${s.role}` }))
      .concat(reading.unknown.map((u): ByteField => ({ from: u.from, to: u.to, tone: 'dim', label: `field ${u.field}, skipped` })))
      .sort((a, b) => a.from - b.from);
  }, [reading]);
  return reading.bytes.length ? <ByteGrid bytes={reading.bytes} fields={fields} ariaLabel="The encoded message" /> : <p className="empty-note">An empty message is zero bytes.</p>;
}
