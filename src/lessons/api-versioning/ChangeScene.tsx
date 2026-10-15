import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { SortTh, ChipButton, Hint, Legend, Provenance, TextField } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { WideRegion } from '../../components/WideRegion';
import { useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import {
  BASE_API, CHANGES, CLASS_LABEL, CLIENTS, DEFAULT_NAME, ROW_COLUMNS, matrix, parseFieldName, responseLines, type ChangeId, type ClientId, type Status,
} from './api';
import { changeCaption } from './captions';

const MATRIX_MIN_WIDTH = 780;
const STATUS_TONE: Record<Status, Tone> = { ok: 'ok', changed: 'orange', broken: 'bad' };
const STATUS_WORD: Record<Status, string> = { ok: 'works', changed: 'result changed', broken: 'breaks' };
/** Three plain categories and a grey: orange stays free for "works, but the result changed". */
const CLIENT_TONE: Record<ClientId, Tone> = { mobile: 'amber', partner: 'sky', web: 'pink', batch: 'muted' };

/** Lines present in one response and not the other: removed are `del` in the old, added are `add` in the new. */
const diff = (own: readonly string[], other: readonly string[], mark: LineState) => (i: number): LineState => (i > 0 && !other.includes(own[i]) ? mark : 'idle');

export function ChangeScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [selected, setSelected] = useState<ChangeId>('add-field');
  const [nameText, setNameText] = useState(DEFAULT_NAME);
  const [name, setName] = useState(DEFAULT_NAME);
  const [nameError, setNameError] = useState<string | null>(null);

  const change = CHANGES.find((c) => c.id === selected)!;
  const rows = useMemo(() => matrix(name), [name]);
  const row = rows.find((r) => r.change.id === selected)!;
  const { sorted, headerProps } = useSortedRows(rows, ROW_COLUMNS);

  const caption = useMemo(() => changeCaption(change, name), [change, name]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const editName = (text: string) => {
    setNameText(text);
    const r = parseFieldName(text);
    setNameError(r.ok ? null : r.error);
    if (r.ok) setName(r.value);
  };

  const before = responseLines(BASE_API, change.show);
  const after = responseLines(change.apply(name), change.show);

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'still works' },
            { color: 'var(--orange)', label: 'works, result changed' },
            { color: 'var(--bad)', label: 'breaks' },
            ...CLIENTS.map((c) => ({ color: `var(--${CLIENT_TONE[c.id] === 'muted' ? 'muted' : CLIENT_TONE[c.id]})`, label: c.label })),
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <div className="av-chips" role="group" aria-label="The change">
            {CHANGES.map((c) => <ChipButton key={c.id} tone="info" on={selected === c.id} onClick={() => setSelected(c.id)}>{c.label}</ChipButton>)}
          </div>
        </>,
        change.usesName ? (
          <span key="name" className="av-field">
            <TextField label="New field name" value={nameText} onChange={editName} width={170} spellCheck={false} maxLength={24} />
            {nameError && <span className="av-error" role="alert">{nameError}</span>}
          </span>
        ) : (
          <Hint key="none">The selected change takes no typed value.</Hint>
        ),
      ]}
    >
      <div className="stage-pad av">
        <div className="av-pair">
          <CodePanel title={`GET ${change.show}, before`} lines={before} gutter="none" stateOf={diff(before, after, 'del')} />
          <CodePanel title={`GET ${change.show}, after`} lines={after} gutter="none" stateOf={diff(after, before, 'add')} />
        </div>

        <WideRegion minWidth={MATRIX_MIN_WIDTH} label="Compatibility matrix: scroll sideways to see all of it">
          <table className="data-table av-matrix">
            <caption className="av-caption">Every change run against every client: nine changes, four clients, thirty-six real runs</caption>
            <thead>
              <tr>
                <SortTh {...headerProps('change')}>Change</SortTh>
                {CLIENTS.map((c) => (
                  <th key={c.id} scope="col" className={`av-client tone-${CLIENT_TONE[c.id]}`}>{c.label}</th>
                ))}
                <SortTh {...headerProps('broken')}>Broken</SortTh>
                <SortTh {...headerProps('kind')}>Class</SortTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.change.id} className={r.change.id === selected ? 'is-selected' : undefined}>
                  <th scope="row" className="av-rowhead">
                    <button type="button" className="av-pick" aria-pressed={r.change.id === selected} onClick={() => setSelected(r.change.id)}>{r.change.label}</button>
                  </th>
                  {CLIENTS.map((c) => {
                    const cell = r.cells[c.id];
                    return (
                      <td key={c.id} className={`av-cell tone-${STATUS_TONE[cell.status]}`} title={cell.reason}>
                        <b>{STATUS_WORD[cell.status]}</b>
                        {cell.status === 'broken' && <span className="av-why">{cell.reason}</span>}
                      </td>
                    );
                  })}
                  <td>{r.broken} of {CLIENTS.length}</td>
                  <td>{CLASS_LABEL[r.cls]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>

        <Box className="av-detail">
          <SectionTitle weight="regular" hint={CLASS_LABEL[row.cls]}>{change.label}: what each client did</SectionTitle>
          <ul className="av-reasons">
            {CLIENTS.map((c) => {
              const cell = row.cells[c.id];
              return (
                <li key={c.id} className={`log-row tone-${STATUS_TONE[cell.status]}`}>
                  <b>{c.label}</b> <span className="muted">({c.role})</span>: {STATUS_WORD[cell.status]}. {cell.reason}.
                </li>
              );
            })}
          </ul>
        </Box>
        <div className="av-chips">
          <Provenance kind="illustrative">invented clients and an invented API</Provenance>
          <Provenance kind="real">the JSON is real text and each client is real code that calls <code>JSON.parse</code> on it</Provenance>
        </div>
        <Hint block>
          "Breaking" is a property of a change and a client together. Reading only the fields you use (a tolerant reader) is a long-standing practice, often credited to Postel's law and to Martin Fowler's writing; it is common practice, not a guarantee.
        </Hint>
      </div>
    </StageFrame>
  );
}
