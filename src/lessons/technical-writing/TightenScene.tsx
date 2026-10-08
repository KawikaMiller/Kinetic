import { useState, type ReactNode } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { Bar } from '../../components/Bar';
import { CodePanel, type LineState } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { diffLines, lineKind, wordDiff } from './diff';
import { skimEnd } from './textStats';
import { ASK_CUE, EDITS, NO_EDITS, renderUpdate, toggleEdit, viewOf, type EditId, type Edits } from './update';

type Show = 'diff' | 'clean';
const SHOW_OPTIONS = [
  { value: 'diff' as const, label: 'Diff of last edit' },
  { value: 'clean' as const, label: 'Clean text' },
];

/** The grade level where the bar ends; the track is not a target, only a scale. */
const GRADE_SCALE = 16;
const ONE_DECIMAL = (n: number) => n.toFixed(1);

interface Row {
  plain: string;
  node: ReactNode;
  state: LineState;
  /** True when the line holds the ask (in the text after the edit, not in removed words). */
  hasAsk: boolean;
}

function diffRows(before: string, after: string): Row[] {
  return diffLines(wordDiff(before, after)).map((line) => {
    const kind = lineKind(line);
    const kept = line.spans.filter((s) => s.kind !== 'del').map((s) => s.text).join(' ');
    return {
      plain: line.spans.map((s) => s.text).join(' '),
      state: kind === 'ins' ? 'add' : kind === 'del' ? 'del' : 'idle',
      hasAsk: ASK_CUE.test(kept),
      node: line.spans.map((s, i) =>
        s.kind === 'del' ? (
          <del key={i} className="tw-del">{s.text} </del>
        ) : s.kind === 'ins' ? (
          <ins key={i} className="tw-ins">{s.text} </ins>
        ) : (
          <span key={i}>{s.text} </span>
        ),
      ),
    };
  });
}

function cleanRows(text: string): Row[] {
  const cut = skimEnd(text);
  let start = 0;
  return text.split('\n').map((line) => {
    const at = cut - start;
    const row: Row = {
      plain: line,
      state: 'idle',
      hasAsk: ASK_CUE.test(line),
      node:
        at > 0 && at <= line.length ? (
          <>
            {line.slice(0, at)}
            <span className="tw-skim">skim stops here</span>
            {line.slice(at)}
          </>
        ) : (
          line
        ),
    };
    start += line.length + 1;
    return row;
  });
}

export function TightenScene({ picker }: { picker: ReactNode }) {
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [last, setLast] = useState<{ id: EditId; before: Edits } | null>(null);
  const [show, setShow] = useState<Show>('diff');
  const setCaption = useSetCaption();
  useIntroCaption(<>A wordy incident update, about 180 words (the incident is fictional). Apply the edits one at a time: the diff shows what changed and the numbers update from the text on screen.</>);

  const view = viewOf(edits);
  const { stats } = view;
  const diffing = last !== null && show === 'diff';
  const rows = last && diffing ? diffRows(renderUpdate(last.before), view.text) : cleanRows(view.text);
  const draftWords = viewOf(NO_EDITS).stats.words;

  const apply = (id: EditId) => {
    const before = edits;
    const next = toggleEdit(edits, id);
    const after = viewOf(next);
    const def = EDITS.find((e) => e.id === id)!;
    setEdits(next);
    setLast({ id, before });
    setShow('diff');
    const verb = next[id] ? def.why : `Undid "${def.label}": that wording is back.`;
    const ask =
      after.askAt === null ? '' : after.askSkimmed ? ` The ask now starts at word ${after.askAt}, inside what a skimmer reads.` : ` The ask starts at word ${after.askAt}, past where a skimmer stops.`;
    setCaption(<>{verb} The text is now {after.stats.words} words.{ask}</>);
  };

  const reset = () => {
    setEdits(NO_EDITS);
    setLast(null);
    setCaption(<>Back to the original {draftWords}-word draft.</>);
  };

  const controls = [
    <>
      {picker}
      <Segmented ariaLabel="What the text panel shows" value={show} onChange={setShow} options={SHOW_OPTIONS} />
    </>,
    <>
      <div className="tw-chips" role="group" aria-label="Edits">
        {EDITS.map((e) => (
          <ChipButton key={e.id} tone={last?.id === e.id && edits[e.id] ? 'hi' : 'muted'} size="md" on={edits[e.id]} onStyle="solid" onClick={() => apply(e.id)}>
            {e.label}
          </ChipButton>
        ))}
      </div>
      <Button onClick={reset}>Reset</Button>
    </>,
  ];

  const askText =
    view.askAt === null ? 'no ask in the text' : `the ask starts at word ${view.askAt} of ${stats.words}, ${view.askSkimmed ? 'inside' : 'after'} the skimmed part`;

  return (
    <StageFrame
      height={420}
      controls={controls}
      stats={
        <Stats>
          <Stat label="Words" value={<AnimatedValue value={stats.words} />} />
          <Stat label="Sentences" value={<AnimatedValue value={stats.sentences} />} />
          <Stat label="Words per sentence" value={<AnimatedValue value={ONE_DECIMAL(stats.perSentence)} />} />
          <Stat label="Grade level" value={<AnimatedValue value={ONE_DECIMAL(stats.grade)} />}>
            <Bar value={Math.max(0, stats.grade)} max={GRADE_SCALE} tone="muted" height={6} ariaLabel={`Grade level ${ONE_DECIMAL(stats.grade)} on a scale to ${GRADE_SCALE}`} />
          </Stat>
          <Stat label="Ask at word" value={<AnimatedValue value={view.askAt ?? 'none'} />} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'edit just applied' },
            { color: 'var(--bad)', label: 'removed (struck through)' },
            { color: 'var(--ok)', label: 'inserted' },
            { color: 'var(--info)', label: 'the ask' },
            { color: 'var(--orange)', label: 'skim stops here' },
          ]}
        />
      }
    >
      <div className="tw-stage stage-pad">
        <Box variant="sunken">
          <CodePanel
            className="tw-code"
            title={diffing ? 'incident-update.txt: what the last edit changed' : 'incident-update.txt'}
            lines={rows.map((r) => r.plain)}
            gutter="none"
            stateOf={(i) => rows[i].state}
            renderLine={(_, i) => rows[i].node}
            trailing={(i) => (rows[i].hasAsk ? <span className="chip tone-info tw-tag">ask</span> : null)}
          />
        </Box>

        <Box>
          <SectionTitle hint="illustrative model, not measured readers">Attention strip</SectionTitle>
          <Bar
            value={view.skimWords}
            max={stats.words}
            tone="muted"
            height={14}
            animate
            markers={[
              { at: view.skimWords, tone: 'orange' },
              ...(view.askAt === null ? [] : [{ at: view.askAt - 1, tone: 'info' as const }]),
            ]}
            ariaLabel={`A skimmer reads the first ${view.skimWords} of ${stats.words} words; ${askText}.`}
          />
          <p className="tw-strip-note">
            A skimmer is assumed to read the first {view.skimWords} of {stats.words} words (the first three sentences); {askText}.
          </p>
        </Box>
        <Hint block>
          Simplified: the strip assumes a reader stops after three sentences, and grade level uses an approximate syllable count. Neither is measured from real readers, and a formula
          cannot tell whether a text is clear.
        </Hint>
      </div>
    </StageFrame>
  );
}
