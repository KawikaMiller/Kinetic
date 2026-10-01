import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Tray } from '../../components/Panel';
import { Button, ChipButton, TextField } from '../../components/ui';
import { plural } from '../../core/format';
import { popIn } from '../../core/motion';
import { symbolsOn, type Hit, type NavState, type Step } from './model';

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function Hits({ hits, onOpen, tone }: { hits: Hit[]; onOpen: (h: Hit) => void; tone: 'info' | 'violet' }) {
  return (
    <ul className={`rc-hits is-${tone}`}>
      {hits.map((h) => (
        <li key={`${h.file}:${h.line}`}>
          <button type="button" className="rc-hit" onClick={() => onOpen(h)}>
            <span className="rc-hit-loc">{nameOf(h.file)}:{h.line}</span>
            <span className="rc-hit-text">{h.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The navigation tools: search, symbol actions on the selected line, blame, and the breadcrumbs. */
export function Tools({ nav, onAct, onOpenHit }: { nav: NavState; onAct: (s: Step) => void; onOpenHit: (h: Hit) => void }) {
  const [query, setQuery] = useState('');
  const line = nav.at && nav.at.line > 0 ? nav.at : null;
  const symbols = line ? symbolsOn(line) : [];
  const doSearch = () => {
    if (query.trim()) onAct({ tool: 'search', query: query.trim() });
  };

  return (
    <div className="rc-tools">
      <Tray stack label={nav.search ? <>Search the repo: {plural(nav.search.hits.length, 'match', 'matches')}</> : 'Search the repo'}>
        <div className="rc-search">
          <TextField value={query} onChange={setQuery} onEnter={doSearch} placeholder="e.g. 402" ariaLabel="Search text" spellCheck={false} className="rc-search-field" />
          <Button onClick={doSearch} disabled={!query.trim()}>Search</Button>
        </div>
        {nav.search && (nav.search.hits.length > 0
          ? <Hits hits={nav.search.hits} onOpen={onOpenHit} tone="info" />
          : <span className="empty-note">No matches for "{nav.search.query}".</span>)}
      </Tray>

      <Tray stack label="Symbols on the selected line" empty={line ? 'none this repo defines' : 'select a line first'}>
        {symbols.length > 0 && symbols.map((s) => (
          <div key={s} className="rc-symbol">
            <code className="rc-symbol-name">{s}</code>
            <span className="rc-symbol-actions">
              <ChipButton tone="violet" onClick={() => onAct({ tool: 'definition', symbol: s })}>Go to definition</ChipButton>
              <ChipButton tone="violet" on={nav.refs?.symbol === s} onClick={() => onAct({ tool: 'references', symbol: s })}>Find references</ChipButton>
            </span>
          </div>
        ))}
      </Tray>
      {nav.refs && (
        <Tray stack label={<>References to <code>{nav.refs.symbol}</code>: {plural(nav.refs.hits.length, 'line')}</>}>
          {nav.refs.hits.length > 0 && <Hits hits={nav.refs.hits} onOpen={onOpenHit} tone="violet" />}
        </Tray>
      )}

      <div className="rc-blame">
        <Button onClick={() => onAct({ tool: 'blame' })} disabled={!line}>Blame this line</Button>
        <AnimatePresence>
          {nav.blamed && (
            <motion.div key={`${nav.blamed.at.file}:${nav.blamed.at.line}`} className="rc-commit" {...popIn}>
              <span className="rc-commit-head"><b>{nav.blamed.commit.hash}</b> · {nav.blamed.commit.author} · {nav.blamed.commit.date}</span>
              <span className="rc-commit-msg">{nav.blamed.commit.message}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Tray stack label="Breadcrumbs" empty="the files you visit, in order">
        {nav.trail.length > 0 && (
          <ol className="rc-trail">
            {nav.trail.map((f, i) => (
              <li key={`${f}-${i}`}>
                {i > 0 && <span className="rc-trail-arrow" aria-hidden="true">→ </span>}
                <span className="chip tone-violet">{nameOf(f)}</span>
              </li>
            ))}
          </ol>
        )}
      </Tray>
    </div>
  );
}
