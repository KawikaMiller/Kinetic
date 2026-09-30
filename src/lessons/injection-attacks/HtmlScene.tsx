import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { escapeHtml, pasteIntoMarkup, renderHtml, visibleText, type Run } from './html';

const COMMENTS = [
  { id: 'bold', label: 'use <b>bold</b>' },
  { id: 'compare', label: 'a<b and b>c' },
  { id: 'entity', label: 'Tom &amp; Jerry' },
  { id: 'heart', label: 'I <3 it' },
];

export function HtmlScene({ picker }: { picker: ReactNode }) {
  const [comment, setComment] = useState('use <b>bold</b>');
  const setCaption = useSetCaption();
  const pasted = renderHtml(comment);
  const shown = visibleText(comment);
  const intact = shown === comment;
  const lost = comment.length - shown.length;

  useIntroCaption(
    <>A comment box. Pasting the comment into the page&apos;s HTML lets the browser read it as markup; setting it as text shows exactly what was typed.</>,
  );

  const update = (value: string) => {
    setComment(value);
    setCaption(captionFor(value), { quiet: true });
  };

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Pasted in" value={intact ? 'as typed' : 'changed'} color={intact ? 'var(--ok)' : 'var(--bad)'} sub={intact ? 'by luck' : `${plural(Math.max(lost, 0), 'character')} lost or reshaped`} />
          <Stat label="Set as text" value="as typed" color="var(--ok)" sub="always" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your text' },
            { color: 'var(--bad)', label: 'read as markup' },
            { color: 'var(--ok)', label: 'shown exactly as typed' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="Comment" value={comment} onChange={update} spellCheck={false} width={240} />
          <ControlGroup label="Try">
            {COMMENTS.map((c) => (
              <ChipButton key={c.id} tone="info" on={comment === c.label} onClick={() => update(c.label)}>{c.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad inj">
        <div className="inj-pair">
          <Box className="inj-side">
            <SectionTitle hint="innerHTML">Pasted into the HTML</SectionTitle>
            <code className="inj-code-line">{'el.innerHTML = "<p>" + comment + "</p>";'}</code>
            <p className="inj-label">The browser reads</p>
            <code className="inj-query">
              {'<p>'}
              <Markup text={comment} swallowed={pasted.swallowed} />
              {'</p>'}
            </code>
            <p className="inj-label">People see</p>
            <div className={`inj-card ${intact ? 'is-intact' : 'is-changed'}`}>
              {pasted.runs.length ? pasted.runs.map((r, i) => <RunView key={i} run={r} />) : <span className="empty-note">(nothing)</span>}
            </div>
            <p className={`log-row ${intact ? 'tone-dim' : 'tone-bad'} inj-verdict`}>
              {intact
                ? 'Looks right, but only by luck: nothing in it happened to look like a tag.'
                : `Not what was typed: ${plural(pasted.swallowed.length, 'piece')} read as markup.`}
            </p>
          </Box>
          <Box className="inj-side">
            <SectionTitle hint="textContent">Set as text</SectionTitle>
            <code className="inj-code-line">el.textContent = comment;</code>
            <p className="inj-label">Same effect as encoding it first</p>
            <code className="inj-query inj-encoded">{pasteIntoMarkup(escapeHtml(comment))}</code>
            <p className="inj-label">People see</p>
            <div className="inj-card is-intact">{comment || <span className="empty-note">(nothing)</span>}</div>
            <p className="log-row tone-ok inj-verdict">Exactly what was typed, whatever it contains.</p>
          </Box>
        </div>
        <p className="inj-honest">
          Simulated browser rendering; the comment is never put into this page as HTML. The model follows the HTML tokenizer&apos;s rules for tags and a few common entities.
        </p>
      </div>
    </StageFrame>
  );
}

/** The comment as the browser reads it: pieces taken as markup in red, the rest as data. */
function Markup({ text, swallowed }: { text: string; swallowed: { text: string; start: number }[] }) {
  const parts: { text: string; markup: boolean }[] = [];
  let at = 0;
  for (const s of swallowed) {
    if (s.start > at) parts.push({ text: text.slice(at, s.start), markup: false });
    parts.push({ text: s.text, markup: true });
    at = s.start + s.text.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), markup: false });
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.markup ? 'inj-became-code' : 'inj-data'}>{p.text}</span>
      ))}
    </>
  );
}

function RunView({ run }: { run: Run }) {
  let node: ReactNode = run.text;
  if (run.mono) node = <code>{node}</code>;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong>{node}</strong>;
  return <>{node}</>;
}

function captionFor(comment: string): ReactNode {
  const shown = visibleText(comment);
  if (shown === comment) {
    return (
      <>This one survives, but only because <code>&lt;</code> followed by a digit or a space isn&apos;t a tag. Relying on that is luck, not a fix.</>
    );
  }
  if (comment.includes('&')) {
    return <>The browser decoded <span className="hl bad">&amp;amp;</span> into &amp;, so someone writing about HTML can&apos;t show it. As text, it stays as typed.</>;
  }
  return (
    <>The browser read part of the comment as <span className="hl bad">markup</span>: it now shows <span className="hl">{shown || '(nothing)'}</span>. Set as text, it can&apos;t.</>
  );
}
