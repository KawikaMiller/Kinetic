import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextArea } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plainTone } from '../../core/tone';
import { flowCaption } from './captions';
import { initialFlowScene } from './init';
import { partitionOf, plan, reference, sameResult, sortedEntries } from './job';
import { TEXT_PRESETS, WORD_LIMIT, shownWord, wordsOf } from './text';

/** How many pairs one mapper box draws before it says "and N more". */
const PAIRS_SHOWN = 20;
const MAX_MAPPERS = 6;
const MAX_REDUCERS = 4;
const TEXT_ROWS = 3;

export function FlowScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialFlowScene);
  const { text, mappers, reducers } = state;

  const all = useMemo(() => wordsOf(text), [text]);
  const words = all.length > WORD_LIMIT ? all.slice(0, WORD_LIMIT) : all;
  const p = useMemo(() => plan({ job: 'wordcount', combiner: 'off', words, mappers, reducers }), [words, mappers, reducers]);
  const truth = useMemo(() => reference('wordcount', words), [words]);
  const equal = sameResult(p.result, truth);

  useIntroCaption(flowCaption(p, words.length, all.length > WORD_LIMIT ? all.length : null), [p, all.length]);

  const rows = sortedEntries(p.result);
  const plain = sortedEntries(truth);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Words" value={words.length} sub={`${new Set(words).size} distinct`} />
          <Stat label="Pairs shuffled" value={p.shuffled} color="var(--info)" sub="one per word, no combiner" />
          <Stat label="Result" value={equal ? 'equal' : 'differs'} color={equal ? 'var(--ok)' : 'var(--bad)'} sub="against a plain count" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'map side: splits and their pairs', shape: 'square' },
            { color: 'var(--violet)', label: 'reduce side: what each reducer received and added up', shape: 'square' },
            { color: 'var(--amber)', label: 'a pair is tinted by the reducer it goes to (a hue each)', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Splits M" value={mappers} min={1} max={MAX_MAPPERS} onChange={(m) => setState((s) => ({ ...s, mappers: m }))} />
          <Slider label="Reducers R" value={reducers} min={1} max={MAX_REDUCERS} onChange={(r) => setState((s) => ({ ...s, reducers: r }))} />
        </>,
        <>
          <TextArea label="Input text" value={text} onChange={(t) => setState((s) => ({ ...s, text: t }))} rows={TEXT_ROWS} mono={false} spellCheck={false} className="mr-text" />
          {TEXT_PRESETS.map((pr) => (
            <ChipButton key={pr.id} tone="info" on={text === pr.text} onClick={() => setState((s) => ({ ...s, text: pr.text }))}>{pr.label}</ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="mr-stage stage-pad">
        <Box>
          <SectionTitle hint={`lowercase, split on anything that is not a letter; up to ${WORD_LIMIT} words`}>1 · Split and map</SectionTitle>
          <div className="mr-cols">
            {p.splits.map((split, i) => (
              <div key={i} className="mr-task tone-info">
                <b>map {i + 1}</b>
                <span className="mr-words">{split.length === 0 ? 'no words' : split.map(shownWord).join(' ')}</span>
                <span className="mr-pairs" aria-label={`map ${i + 1} emits ${p.mapOut[i].length} pairs`}>
                  {p.mapOut[i].slice(0, PAIRS_SHOWN).map((rec, k) => (
                    <span key={k} className={`mr-pair tone-${plainTone(partitionOf(rec.key, reducers))}`}>({shownWord(rec.key)}, {rec.sum})</span>
                  ))}
                  {p.mapOut[i].length > PAIRS_SHOWN && <span className="mr-more">and {p.mapOut[i].length - PAIRS_SHOWN} more</span>}
                </span>
              </div>
            ))}
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`pair goes to reducer hash(word) mod ${reducers}, then each reducer sorts by word`}>2 · Shuffle and reduce</SectionTitle>
          <div className="mr-cols">
            {p.reduced.map((out, r) => (
              <div key={r} className="mr-task tone-violet">
                <b>reduce {r + 1}</b>
                <span className="mr-words">{p.parts[r].length} pairs in</span>
                <span className="mr-lines">
                  {[...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, PAIRS_SHOWN).map(([k, v]) => (
                    <span key={k} className={`mr-line tone-${plainTone(r)}`}>{shownWord(k)} {v}</span>
                  ))}
                  {out.size === 0 && <span className="mr-more">nothing</span>}
                  {out.size > PAIRS_SHOWN && <span className="mr-more">and {out.size - PAIRS_SHOWN} more</span>}
                </span>
              </div>
            ))}
          </div>
        </Box>
        <Box>
          <SectionTitle hint="the reducers' tables put together, against a plain loop over the words">3 · The answer</SectionTitle>
          {rows.length === 0 ? (
            <p className="empty-note">No words.</p>
          ) : (
            <div className="mr-scroll" role="region" aria-label="Word counts: MapReduce against a plain count" tabIndex={0}>
              <table className="data-table mr-table">
                <thead>
                  <tr><th scope="col">Word</th><th scope="col">MapReduce</th><th scope="col">Plain count</th><th scope="col">Equal</th></tr>
                </thead>
                <tbody>
                  {rows.map(([k, v]) => {
                    const t = plain.find(([pk]) => pk === k)?.[1];
                    return (
                      <tr key={k}>
                        <th scope="row">{shownWord(k)}</th>
                        <td>{v}</td>
                        <td>{t ?? 0}</td>
                        <td className={t === v ? 'mr-ok' : 'mr-bad'}>{t === v ? '✓' : '✗'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">the split, map, shuffle and reduce here are real code on your text, compared with a plain count</Provenance>
          <Provenance kind="toy">splits are equal runs of words and the partition is FNV-1a mod R, not any framework&rsquo;s; real jobs split files into blocks of many megabytes</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
