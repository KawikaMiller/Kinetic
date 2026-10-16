import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { starCaption } from './captions';
import { initialStarScene } from './init';
import { QUESTIONS, answerFlat, buildStar, flatTable, joinCount, questionOf, runStar, sameAnswer, type QuestionId } from './star';

const QUESTION_OPTIONS = QUESTIONS.map((q) => ({ value: q.id, label: q.label }));

interface TableCard {
  name: string;
  hint: string;
  columns: string[];
  used: string[];
  fact?: boolean;
}

function cardsFor(q: QuestionId, snowflake: boolean): TableCard[] {
  const question = questionOf(q);
  const usedOf = (table: string) => question.joins.find((j) => j.table === table)?.columns ?? [];
  const regionUsed = snowflake && q === 'region-month';
  return [
    { name: 'orders (fact)', hint: 'one row per order line', columns: ['id', 'customer', 'product', 'date', 'qty', 'amount'], used: [...question.factColumns, ...(question.joins.length ? question.joins.map((j) => j.table) : [])], fact: true },
    { name: 'customer', hint: snowflake ? 'region moved out' : 'a dimension', columns: snowflake ? ['id', 'name', 'segment', 'region_id'] : ['id', 'name', 'segment', 'region'], used: usedOf('customer').map((c) => (snowflake && c === 'region' ? 'region_id' : c)).concat(usedOf('customer').length ? ['id'] : []) },
    { name: 'product', hint: 'a dimension', columns: ['id', 'name', 'category'], used: usedOf('product').concat(usedOf('product').length ? ['id'] : []) },
    { name: 'date', hint: 'a dimension', columns: ['id', 'date', 'month'], used: usedOf('date').concat(usedOf('date').length ? ['id'] : []) },
    ...(snowflake ? [{ name: 'region', hint: 'a table of its own', columns: ['id', 'name', 'country'], used: regionUsed ? ['id', 'name'] : [] }] : []),
  ];
}

export function StarScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialStarScene);
  const { question, snowflake, seed } = state;

  const star = useMemo(() => buildStar(seed), [seed]);
  const run = useMemo(() => runStar(star, question, snowflake), [star, question, snowflake]);
  const flat = useMemo(() => answerFlat(flatTable(star), star.dates.at(-1)!.date, question), [star, question]);
  const equal = sameAnswer(run.answer, flat);

  useIntroCaption(starCaption(question, snowflake, run.joins, run.answer.length, equal), [question, snowflake, seed]);

  const cards = cardsFor(question, snowflake);

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Joins" value={run.joins.length} color="var(--info)" sub={snowflake ? `${joinCount(question, false)} in the star, ${joinCount(question, true)} in the snowflake` : run.joins.join(', ')} />
          <Stat label="Fact rows" value={star.facts.length} sub="order lines scanned" />
          <Stat label="Same as flat" value={equal ? 'equal' : 'differs'} color={equal ? 'var(--ok)' : 'var(--bad)'} sub="a pre-joined table, built another way" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a table or column the question uses (joins and columns read)', shape: 'square' },
            { color: 'var(--dim)', label: 'not used by this question', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Business question" value={question} onChange={(q) => setState((s) => ({ ...s, question: q }))} options={QUESTION_OPTIONS} />
        </>,
        <>
          <Toggle label="Region" value={snowflake} onChange={(v) => setState((s) => ({ ...s, snowflake: v }))} off="Inside customer (star)" on="Its own table (snowflake)" />
          <SeedField key={seed} seed={seed} onSeed={(s) => setState((st) => ({ ...st, seed: s }))} />
        </>,
      ]}
    >
      <div className="wl-stage stage-pad">
        <Box>
          <SectionTitle hint="the fact table in the middle of its dimensions">The schema</SectionTitle>
          <div className="wl-cards">
            {cards.map((c) => (
              <div key={c.name} className={`wl-card${c.fact ? ' is-fact' : ''}${c.used.length > 0 ? ' is-used' : ''}`}>
                <b>{c.name}</b>
                <span className="wl-hint">{c.hint}</span>
                <span className="wl-cols">
                  {c.columns.map((col) => (
                    <span key={col} className={`wl-col${c.used.includes(col) ? ' is-used' : ''}`}>{col}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`${plural(run.joins.length, 'join')}, then group`}>The answer</SectionTitle>
          <div className="wl-scroll" role="region" aria-label="The answer to the business question" tabIndex={0}>
            <table className="data-table wl-table">
              <thead>
                <tr><th scope="col">Group</th><th scope="col">Star schema</th><th scope="col">Flat table</th><th scope="col">Equal</th></tr>
              </thead>
              <tbody>
                {run.answer.map(([k, v], i) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{v}</td>
                    <td>{flat[i]?.[1] ?? '–'}</td>
                    <td className={flat[i]?.[0] === k && flat[i]?.[1] === v ? 'wl-ok' : 'wl-bad'}>{flat[i]?.[0] === k && flat[i]?.[1] === v ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded customers, products and {star.facts.length} order lines over {star.dates.length} days; the answers are computed, not typed</Provenance>
          <Provenance kind="real">the star-schema answer and the flat-table answer are two separate pieces of code, compared row by row</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
