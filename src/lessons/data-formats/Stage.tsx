import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { useScenePicker } from '../../components/ScenePicker';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextArea } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes } from '../../core/format';
import {
  EDITS, PITFALLS, SAMPLE, SAMPLE_TEXT, byteSize, changedPaths, parseCsv, parseJson, toCsv, toXml, toYaml, unsafeNumberPaths,
  validateUsers, type Format, type Json, type Line, type Pitfall,
} from './model';
import './styles.css';

type Scene = 'convert' | 'pitfalls';

const SCENES = [
  { value: 'convert' as const, label: 'One record, four formats' },
  { value: 'pitfalls' as const, label: 'Pitfalls' },
];

const FORMATS: { value: Format; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
];

/** Lines of JSON shown around a parse error. */
const ERROR_CONTEXT = 2;

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'View', options: SCENES, initial: 'convert' });
  return scene === 'convert' ? <Convert picker={picker} /> : <Pitfalls picker={picker} />;
}

function Convert({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [value, setValue] = useState<Json>(SAMPLE);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<string | null>('sample');
  const setCaption = useSetCaption();

  useIntroCaption(
    <>The same three users, written four ways. The JSON editor is the source of truth: edit it and every other format follows,
      with the changed field highlighted wherever it appears.</>,
  );

  const parsed = parseJson(text);
  const csv = toCsv(value);
  const yaml = toYaml(value);
  const xml = toXml(value);
  const unsafe = unsafeNumberPaths(value);
  const issues = parsed.ok ? validateUsers(parsed.value) : [];

  const apply = (next: string) => {
    setText(next);
    const p = parseJson(next);
    if (!p.ok) return;
    setChanged(changedPaths(value, p.value));
    setValue(p.value);
  };

  const load = (e: (typeof EDITS)[number]) => {
    apply(e.text);
    setLoaded(e.id);
    setCaption(e.caption);
  };

  const state = (line: Line) => (line.paths.some((p) => changed.has(p)) ? 'now' : 'idle');
  const rowState = (i: number) => (i > 0 && [...changed].some((p) => p.startsWith(`${i - 1}.`)) ? 'now' : 'idle');
  const isUnsafe = (paths: string[]) => paths.some((p) => unsafe.has(p));
  const render = (lines: Line[]) => (text: string, i: number) =>
    isUnsafe(lines[i].paths) ? <span className="df-bad" title="this number didn't survive JSON.parse (precision lost, or too big: Infinity)">{text}</span> : text;

  const sizes = { json: byteSize(text), csv: csv ? byteSize(csv.text) : null, yaml: byteSize(yaml.map((l) => l.text).join('\n')), xml: byteSize(xml.map((l) => l.text).join('\n')) };
  const csvRows = csv ? parseCsv(csv.text) : [];
  const lossyColumns = new Set(csv?.lossy.map((l) => l.column));

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="JSON" value={bytes(sizes.json, { base: 1000 })} color="var(--hi)" />
          <Stat label="CSV" value={sizes.csv === null ? '–' : bytes(sizes.csv, { base: 1000 })} sub="smallest, no nesting" />
          <Stat label="YAML" value={bytes(sizes.yaml, { base: 1000 })} />
          <Stat label="XML" value={bytes(sizes.xml, { base: 1000 })} sub="tags on every value" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'changed field' },
            { color: 'var(--bad)', label: 'parse error / corrupted value' },
            { color: 'var(--ok)', label: 'passes the schema' },
            { color: 'var(--violet)', label: 'lossy in CSV' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Load">
            {EDITS.map((e) => (
              <ChipButton key={e.id} size="md" on={loaded === e.id} onClick={() => load(e)}>
                {e.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad df">
        <div className="df-grid">
          <Box className="df-pane">
            <SectionTitle hint="source of truth · JSON.parse">JSON</SectionTitle>
            <TextArea
              label="Edit the JSON"
              value={text}
              onChange={(v) => {
                apply(v);
                if (loaded !== null) setCaption(<>Your own data now: every pane re-renders from the JSON you type.</>, { quiet: true });
                setLoaded(null);
              }}
              rows={14}
              className={`df-editor ${parsed.ok ? '' : 'is-bad'}`}
            />
            {parsed.ok ? (
              issues.length === 0 ? (
                <p className="df-ok">Parses, and every record passes the schema check.</p>
              ) : (
                <div className="df-issues" role="status">
                  <p className="df-bad-note">Valid JSON, but the schema check fails:</p>
                  {issues.map((iss) => (
                    <code key={iss.path} className="log-row tone-bad">
                      {iss.path || '(the whole document)'}: {iss.message}
                    </code>
                  ))}
                </div>
              )
            ) : (
              <ParseError text={text} error={parsed.error} line={parsed.line} />
            )}
          </Box>

          <Box className="df-pane">
            <SectionTitle hint={csv ? 'RFC 4180' : 'can\'t hold this shape'}>CSV</SectionTitle>
            {csv ? (
              <>
                <CodePanel
                  lines={csv.lines.map((l) => l.text)}
                  stateOf={rowState}
                  renderLine={render(csv.lines)}
                  trailing={(i) => (i === 0 && csv.lossy.length ? <span className="df-lossy">lossy</span> : null)}
                  gutter="none"
                />
                <p className="df-lossy-note">
                  CSV is rows of text: <b>address</b> became dotted columns and <b>tags</b> one ";"-joined cell. Read back, the
                  tags are a string, not a list:
                </p>
                <div className="df-table-wrap">
                  <table className="data-table df-table">
                    <thead>
                      <tr>
                        {csvRows[0]?.map((h) => (
                          <th key={h} className={lossyColumns.has(h) ? 'df-lossy' : undefined}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(1).map((r, i) => (
                        <tr key={i}>
                          {r.map((c, k) => (
                            <td key={k}>{c === '' ? <span className="df-empty">(empty)</span> : c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Hint block>CSV needs a list of records; this JSON isn't one, so there's no table to write.</Hint>
            )}
          </Box>

          <Box className="df-pane">
            <SectionTitle hint="indentation is structure">YAML</SectionTitle>
            <CodePanel lines={yaml.map((l) => l.text)} stateOf={(i) => state(yaml[i])} renderLine={render(yaml)} gutter="none" />
          </Box>

          <Box className="df-pane">
            <SectionTitle hint="every value wrapped in tags">XML</SectionTitle>
            <CodePanel lines={xml.map((l) => l.text)} stateOf={(i) => state(xml[i])} renderLine={render(xml)} gutter="none" />
          </Box>
        </div>

        <Hint block>
          YAML and XML are generated by a small built-in emitter; the YAML pitfalls describe YAML 1.1 parsers (e.g. PyYAML), and
          YAML 1.2 fixed some of them.
        </Hint>

        <Box variant="sunken" className="df-when">
          <SectionTitle>Which format when</SectionTitle>
          <ul>
            <li><b>JSON</b>: APIs and anything between programs.</li>
            <li><b>CSV</b>: spreadsheets and bulk exports of flat rows.</li>
            <li><b>YAML</b>: config that humans edit (CI files, Kubernetes).</li>
            <li><b>Binary</b> (Protocol Buffers): fast service-to-service calls, see Tier 2 gRPC.</li>
          </ul>
        </Box>
      </div>
    </StageFrame>
  );
}

function ParseError({ text, error, line }: { text: string; error: string; line: number | null }) {
  const lines = text.split('\n');
  const from = line === null ? 0 : Math.max(0, line - ERROR_CONTEXT);
  const shown = line === null ? [] : lines.slice(from, line + ERROR_CONTEXT + 1);
  return (
    <div className="df-error" role="alert">
      <p className="df-bad-note">JSON.parse refused it: {error}</p>
      {line !== null && (
        <CodePanel
          lines={shown}
          stateOf={(i) => (from + i === line ? 'now' : 'idle')}
          renderLine={(t, i) => (from + i === line ? <span className="df-bad">{t}</span> : t)}
          trailing={(i) => (from + i === line ? 'noticed here' : null)}
        />
      )}
      <Hint block>
        The parser flags where it noticed the problem, which is often just after the actual mistake. The other formats still show the
        last valid version.
      </Hint>
    </div>
  );
}

function Pitfalls({ picker }: { picker: ReactNode }) {
  const [format, setFormat] = useState<Format>('csv');
  const setCaption = useSetCaption();

  useIntroCaption(<>Every format has a way to quietly corrupt your data. Each card shows the bug, then the fix, computed live on this page.</>);

  const choose = (f: Format) => {
    setFormat(f);
    setCaption(FORMAT_CAPTIONS[f]);
  };

  return (
    <StageFrame
      height={460}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the bug' },
            { color: 'var(--ok)', label: 'the fix' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Format" value={format} onChange={choose} options={FORMATS} />
        </>,
      ]}
    >
      <div className="stage-pad df">
        {PITFALLS.filter((p) => p.format === format).map((p) => (
          <PitfallCard key={p.id} p={p} />
        ))}
      </div>
    </StageFrame>
  );
}

const FORMAT_CAPTIONS: Record<Format, ReactNode> = {
  csv: <>CSV looks simple until a field contains a comma or a line break, and then a spreadsheet guesses the types.</>,
  json: <>JSON is strict about syntax and loose about meaning: no comments, no dates, and numbers that aren't safe for big ids.</>,
  yaml: <>YAML guesses types for unquoted values and uses indentation as structure: both fail silently.</>,
  xml: <>XML's pitfalls are about agreement: the same data fits several valid shapes.</>,
};

function PitfallCard({ p }: { p: Pitfall }) {
  const snippet = (s: Pitfall['before'], tone: 'bad' | 'ok') => (
    <div className="df-side">
      <span className={`df-side-label tone-${tone}`}>{tone === 'bad' ? 'Bug' : 'Fix'} · {s.label}</span>
      <CodePanel
        lines={s.lines}
        gutter="none"
        renderLine={(t, i) => (s.marked.includes(i) ? <span className={`df-${tone}`}>{t}</span> : t)}
      />
    </div>
  );
  return (
    <Box className="df-card">
      <SectionTitle>{p.title}</SectionTitle>
      <div className="df-sides">
        {snippet(p.before, 'bad')}
        {snippet(p.after, 'ok')}
      </div>
      <p className="df-note">{p.note}</p>
      {p.cited && <Hint block>{p.cited}</Hint>}
    </Box>
  );
}
