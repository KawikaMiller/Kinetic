import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { useRadioGroup } from '../../components/useRadioGroup';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, TextField, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import {
  CODES, ENDPOINTS, METHODS, ORDERS, ORDER_FIELDS, REASON, SCENARIOS, adHocResponse, examplePath, judgeStatus, parsePath, problemResponse, queryString,
  runQuery, shape, successFor, validate, verdict, type Code, type Endpoint, type Level, type Method, type OrderField, type OrderQuery, type OrderStatus,
  type PathShape, type SortKey,
} from './model';
import './styles.css';

type SceneId = 'board' | 'status' | 'collections';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'board', label: 'Redesign board' },
  { value: 'status', label: 'Status codes' },
  { value: 'collections', label: 'Collections & errors' },
];
const HONEST = 'Conventions, not a standard: the validator encodes common REST guidelines and says which rules come from RFC 9110.';
const LEVEL_TONE: Record<Level, Tone> = { ok: 'ok', warn: 'orange', bad: 'bad' };
const LEVEL_MARK: Record<Level, string> = { ok: '✓', warn: '!', bad: '✗' };

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'board' });
  if (scene === 'status') return <StatusScene picker={picker} />;
  if (scene === 'collections') return <CollectionsScene picker={picker} />;
  return <BoardScene picker={picker} />;
}

// ── Shared bits ─────────────────────────────────────────────────────────

/** A request line: the method in violet, resource nouns in blue, verbs in orange. */
function RequestText({ method, s }: { method: Method; s: PathShape }) {
  return (
    <span className="ra-req">
      <span className="ra-method">{method}</span>{' '}
      {s.segs.length === 0 ? '/' : s.segs.map((g, i) => <span key={i}><wbr />/<span className={`ra-seg is-${g.role}`}>{g.text}</span></span>)}
    </span>
  );
}

// ── Redesign board ──────────────────────────────────────────────────────

type Choice = { method: Method; path: string };

function BoardScene({ picker }: { picker: ReactNode }) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(ENDPOINTS.map((e) => [e.id, e.start])));
  const [selected, setSelected] = useState(ENDPOINTS[0].id);
  const setCaption = useSetCaption();
  useIntroCaption(<>Seven RPC-style endpoints, as shipped. Pick one, then reshape it with a method and a path: the validator explains every flag.</>);
  const e = ENDPOINTS.find((x) => x.id === selected)!;
  const choose = (next: Choice) => {
    setChoices((c) => ({ ...c, [e.id]: next }));
    const flags = validate(e.intent, next.method, shape(next.path));
    const v = verdict(flags);
    const problems = flags.filter((f) => f.level !== 'ok').length;
    setCaption(
      <>{next.method} {next.path}: {v === 'ok'
        ? <span className="hl ok">matches the conventions</span>
        : <>{problems === 1 ? 'one flag' : `${problems} flags`}, worst <span className={`hl ${LEVEL_TONE[v]}`}>{v === 'bad' ? 'a violation' : 'a style warning'}</span></>}.</>,
      { quiet: true },
    );
  };
  const clean = ENDPOINTS.filter((x) => verdict(validate(x.intent, choices[x.id].method, shape(choices[x.id].path))) === 'ok').length;

  return (
    <StageFrame
      height={420}
      legend={<Legend items={[
        { color: 'var(--hi)', label: 'editing' }, { color: 'var(--ok)', label: 'convention met' }, { color: 'var(--bad)', label: 'violation' },
        { color: 'var(--orange)', label: 'style warning' }, { color: 'var(--info)', label: 'resource noun' }, { color: 'var(--violet)', label: 'method' },
      ]} />}
      controls={[<>{picker}<Hint>{clean} of {ENDPOINTS.length} endpoints clean</Hint></>]}
    >
      <div className="stage-pad ra">
        <div className="ra-board">
          <ul className="ra-cards" aria-label="Endpoints">
            {ENDPOINTS.map((x) => {
              const c = choices[x.id];
              const v = verdict(validate(x.intent, c.method, shape(c.path)));
              return (
                <li key={x.id}><button type="button" className={`ra-card tone-${LEVEL_TONE[v]} ${x.id === selected ? 'is-on' : ''}`}
                  aria-current={x.id === selected} onClick={() => setSelected(x.id)}>
                  <span className="ra-card-job">{x.intent.job}</span>
                  <span className="ra-card-legacy">was <code>{x.legacy}</code></span>
                  <span className="ra-card-now"><span className="ra-mark">{LEVEL_MARK[v]}</span> <RequestText method={c.method} s={shape(c.path)} /></span>
                </button></li>
              );
            })}
          </ul>
          <Editor key={e.id} endpoint={e} choice={choices[e.id]} onChoose={choose} />
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

function Editor({ endpoint: e, choice, onChoose }: { endpoint: Endpoint; choice: Choice; onChoose: (c: Choice) => void }) {
  const [typed, setTyped] = useState(choice.path);
  const [error, setError] = useState<string | null>(null);
  const s = shape(choice.path);
  const flags = validate(e.intent, choice.method, s);
  const v = verdict(flags);
  const useTyped = () => {
    const p = parsePath(typed);
    if (!p.ok) return setError(p.error);
    setError(null);
    onChoose({ ...choice, path: p.value.path });
  };
  const request = `${choice.method} ${examplePath(s)} HTTP/1.1`;
  const response = v === 'bad' ? ['(fix the violations first)'] : successFor(e.intent.action, e.intent.resource);

  return (
    <div className="ra-editor">
      <SectionTitle weight="regular" hint={`was ${e.legacy}`}>Editing: {e.intent.job}</SectionTitle>
      <Segmented label="Method" value={choice.method} onChange={(m) => onChoose({ ...choice, method: m })} options={METHODS.map((m) => ({ value: m, label: m }))} />
      <ControlGroup label="Path">
        {e.paths.map((p) => (
          <ChipButton key={p} tone="info" size="md" on={choice.path === p} onClick={() => { setTyped(p); setError(null); onChoose({ ...choice, path: p }); }}>{p}</ChipButton>
        ))}
      </ControlGroup>
      <div className="ra-form">
        <TextField label="Or type a path" value={typed} onChange={setTyped} onEnter={useTyped} width={260} spellCheck={false} />
        <Button onClick={useTyped}>Use path</Button>
        <p className={`ra-msg ${error ? 'is-err' : ''}`} role="status">{error ?? 'Placeholders like {id} stand for one item.'}</p>
      </div>
      <ConsolePanel title="validator" lines={flags.map((f) => ({ text: `${LEVEL_MARK[f.level]} ${f.text} [${f.source}]`, tone: LEVEL_TONE[f.level] }))} />
      <div className="ra-code">
        <CodePanel title="request" lines={[request]} gutter="none" renderLine={() => <><RequestText method={choice.method} s={s} /> HTTP/1.1</>} />
        <CodePanel title="typical response" lines={response} gutter="none" stateOf={(i) => (i === 0 && v !== 'bad' ? 'done' : 'idle')} />
      </div>
    </div>
  );
}

// ── Status codes ────────────────────────────────────────────────────────

function StatusScene({ picker }: { picker: ReactNode }) {
  const [at, setAt] = useState(0);
  const [picks, setPicks] = useState<Record<string, Code | null>>({});
  const setCaption = useSetCaption();
  useIntroCaption(<>Nine situations. Pick the status code each one deserves; the validator explains every wrong pick.</>);
  const s = SCENARIOS[at];
  const pick = picks[s.id] ?? null;
  const judged = pick === null ? null : judgeStatus(s, pick);
  const right = SCENARIOS.filter((x) => picks[x.id] != null && judgeStatus(x, picks[x.id]!).ok).length;
  const choose = (c: Code) => {
    setPicks((p) => ({ ...p, [s.id]: c }));
    const j = judgeStatus(s, c);
    setCaption(<>{c} {REASON[c]} for {s.request}: <span className={`hl ${j.ok ? 'ok' : 'bad'}`}>{j.ok ? 'right' : 'not this one'}</span>.</>, { quiet: true });
  };
  const radio = useRadioGroup(CODES.length, pick === null ? -1 : CODES.indexOf(pick), (i) => choose(CODES[i]));

  return (
    <StageFrame
      height={360}
      legend={<Legend items={[{ color: 'var(--ok)', label: 'fits' }, { color: 'var(--bad)', label: 'wrong pick' }]} />}
      controls={[<>{picker}<Hint>{right} of {SCENARIOS.length} right</Hint></>]}
    >
      <div className="stage-pad ra">
        <div className="ra-scenario">
          <SectionTitle weight="regular" hint={`${at + 1} of ${SCENARIOS.length}`}>Situation</SectionTitle>
          <p className="ra-situation"><code>{s.request}</code> {s.situation}</p>
          <div className="ra-codes" role="radiogroup" aria-label="Status code">
            {CODES.map((c, i) => {
              const state = pick === c ? (judged!.ok ? 'is-right' : 'is-wrong') : '';
              return (
                <button key={c} type="button" className={`ra-code-chip ${state}`} {...radio.itemProps(i)} onClick={() => choose(c)}>
                  <b>{c}</b> {REASON[c]}
                </button>
              );
            })}
          </div>
          <p className={`ra-judgement ${judged ? (judged.ok ? 'is-right' : 'is-wrong') : ''}`} role="status">
            {judged ? judged.text : 'No pick yet.'}
          </p>
          <div className="ra-nav">
            <Button onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0}>← Previous</Button>
            <Button onClick={() => setAt((a) => Math.min(SCENARIOS.length - 1, a + 1))} disabled={at === SCENARIOS.length - 1}>Next →</Button>
          </div>
        </div>
        <Hint block>
          {HONEST} 400 versus 422 for a validation error is the one place teams genuinely differ; pick one and use it everywhere.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── Collections & errors ────────────────────────────────────────────────

const STATUS_OPTIONS: { value: OrderStatus | 'any'; label: string }[] = [
  { value: 'any', label: 'any' }, { value: 'pending', label: 'pending' }, { value: 'paid', label: 'paid' }, { value: 'shipped', label: 'shipped' },
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: '-created_at', label: 'newest first' }, { value: 'created_at', label: 'oldest first' }, { value: '-total', label: 'biggest total' },
];

function CollectionsScene({ picker }: { picker: ReactNode }) {
  const [status, setStatus] = useState<OrderStatus | 'any'>('paid');
  const [sort, setSort] = useState<SortKey>('-created_at');
  const [fields, setFields] = useState<OrderField[]>([]);
  const [problem, setProblem] = useState(true);
  useIntroCaption(<>One collection, many views: filtering, sorting and field selection are query parameters on <code>/orders</code>, not new endpoints.</>);
  const q: OrderQuery = { status: status === 'any' ? null : status, sort, fields };
  const rows = runQuery(ORDERS, q);
  const cols = fields.length ? ORDER_FIELDS.filter((f) => fields.includes(f)) : ORDER_FIELDS;
  const toggle = (f: OrderField) => setFields((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
  const body = problem ? problemResponse() : adHocResponse();

  return (
    <StageFrame
      height={420}
      legend={<Legend items={[{ color: 'var(--violet)', label: 'method' }, { color: 'var(--info)', label: 'collection' }, { color: 'var(--ok)', label: 'problem-details member' }, { color: 'var(--bad)', label: 'ad-hoc error' }]} />}
      controls={[
        <>{picker}</>,
        <>
          <Segmented label="status=" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <Segmented label="sort=" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </>,
        <ControlGroup key="f" label="fields= (none picked: all)" inline>
          {ORDER_FIELDS.map((f) => <ChipButton key={f} tone="info" on={fields.includes(f)} onClick={() => toggle(f)}>{f}</ChipButton>)}
        </ControlGroup>,
        <Toggle key="e" label="Error body" value={problem} onChange={setProblem} off="Ad hoc" on="RFC 9457 problem+json" />,
      ]}
    >
      <div className="stage-pad ra">
        <div className="ra-collect">
          <div className="ra-query">
            <SectionTitle weight="regular" hint={`${rows.length} of ${ORDERS.length} orders`}>Request</SectionTitle>
            <p className="ra-url"><span className="ra-method">GET</span> <span className="ra-seg is-noun">{queryString(q).split('?')[0]}</span>?{queryString(q).split('?')[1]}</p>
            <div className="ra-table-wrap">
              <table className="data-table">
                <thead><tr>{cols.map((c) => <th key={c} className="keep-case">{c}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{String(r[c])}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <Hint block>Paging this list (a limit and a cursor) is the next lesson, <code>pagination</code>. Links between resources (HATEOAS) are part of REST in theory and rare in practice.</Hint>
          </div>
          <div className="ra-error">
            <SectionTitle weight="regular" hint="POST /orders with quantity -3">Error response</SectionTitle>
            <CodePanel lines={body} gutter="none" className={problem ? 'ra-problem' : 'ra-adhoc'}
              stateOf={(i) => (problem ? (/^\s+"(type|title|status|detail|instance)"/.test(body[i]) ? 'done' : 'idle') : i === 0 || i === 3 ? 'bad' : 'idle')} />
            <p className="ra-msg">
              {problem
                ? 'A real 4xx status, a machine-readable type URI, a title for humans, the status repeated, the detail of this case, and an instance id to quote to support.'
                : 'A 200 OK that is really an error: caches, monitors and retries all think it worked, and the client gets no clue what went wrong.'}
            </p>
          </div>
        </div>
        <Hint block>{HONEST} The orders are a fixed sample run in your browser.</Hint>
      </div>
    </StageFrame>
  );
}
