import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Stat, Stats, TextArea, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { SORT_COLUMNS, allowedSort, contextViews } from './contexts';

const SAMPLES = [
  { id: 'obrien', label: "O'Brien", value: "O'Brien" },
  { id: 'file', label: 'my report.pdf', value: 'my report.pdf' },
  { id: 'fish', label: 'fish & chips', value: 'fish & chips' },
  { id: 'bold', label: 'use <b>bold</b>', value: 'use <b>bold</b>' },
  { id: 'lines', label: 'Ada ⏎ second line', value: 'Ada\nsecond line' },
  { id: 'dollar', label: 'Save $5 today', value: 'Save $5 today' },
];

export function ContextsScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState("O'Brien");
  const [sortBy, setSortBy] = useState('surname');
  const views = contextViews(text);
  const broken = views.filter((v) => v.raw.broken).length;
  const sortOk = allowedSort(sortBy);

  useIntroCaption(
    <>The same bug appears anywhere text is pasted into something that gets <b>interpreted</b>. Each ordinary sample breaks a different place.</>,
  );

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Pasted in" value={`${broken} of ${views.length}`} color={broken ? 'var(--bad)' : 'var(--ok)'} sub="places it breaks" />
          <Stat label="Kept separate" value={`0 of ${views.length}`} color="var(--ok)" sub="places it breaks" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'pasted in: the text changed meaning' },
            { color: 'var(--ok)', label: 'kept separate or encoded' },
            { color: 'var(--dim)', label: 'pasted in, but worked this time' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextArea label="Text" value={text} onChange={setText} rows={2} className="inj-text" />
          <ControlGroup label="Try">
            {SAMPLES.map((s) => (
              <ChipButton key={s.id} tone="info" on={text === s.value} onClick={() => setText(s.value)}>{s.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad inj">
        <div className="inj-contexts" role="table" aria-label="The same text in five contexts">
          <div className="inj-ctx-head" role="row">
            <span role="columnheader">Where</span>
            <span role="columnheader">Pasted in</span>
            <span role="columnheader">Kept separate</span>
          </div>
          {views.map((v) => (
            <div key={v.id} className="inj-ctx-row" role="row">
              <div role="cell">
                <b>{v.name}</b>
                <span className="inj-fix">{v.fix}</span>
              </div>
              <div role="cell" className={`inj-ctx-cell ${v.raw.broken ? 'tone-bad' : 'tone-dim'}`}>
                <code>{v.raw.code}</code>
                <ul>{v.raw.result.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
              <div role="cell" className="inj-ctx-cell tone-ok">
                <code>{v.safe.code}</code>
                <ul>{v.safe.result.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            </div>
          ))}
        </div>

        <div className="inj-allow">
          <TextField label="Sort by (a column name can't be a parameter)" value={sortBy} onChange={setSortBy} spellCheck={false} width={180} />
          <p className={`log-row ${sortOk ? 'tone-ok' : 'tone-bad'}`}>
            {sortOk ? `Allowed: ORDER BY ${sortBy}` : `Refused: not one of ${SORT_COLUMNS.join(', ')}`}
          </p>
          <p className="inj-note">For names of things (columns, sort directions, table names) check the value against a fixed allow-list.</p>
        </div>

        <p className="inj-risk">
          These accidents are the mild version. Because the text is read as instructions, someone could deliberately type input
          that changes what the query, page or command does. The fix is the same every time: keep data separate from code, or
          encode it for the exact place it goes. Checking for &quot;bad characters&quot; isn&apos;t the fix: real names contain apostrophes.
        </p>
        <p className="inj-honest">
          Simulated contexts; nothing is run. The URL is parsed with the browser&apos;s real URL API. The shell row is a simplified
          model of how bash reads a command line: quotes, separators and redirections, plus the characters that make it rewrite
          the line first ($…, backticks, ~, globs, {'{a,b}'}, #). Those rewrites are named, not carried out. The cases shown were
          checked against bash; here-docs, aliases and other shells aren&apos;t modelled.
        </p>
      </div>
    </StageFrame>
  );
}
