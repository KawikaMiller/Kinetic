/**
 * Frames for the lesson's scripted run of each anomaly. Every row version, result, abort and
 * verdict comes from the toy engine (`scriptedRun` in ./model); this file only words them.
 */
import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import {
  rowsOf, scriptedRun, verdictOf, type AnomalyId, type Level, type Row, type RunResult, type Saw, type StepRun, type Tone, type Tx,
} from './model';

export interface Op {
  who: Tx;
  sql: string;
  result?: string;
  tone?: Tone;
  col: number;
}

export interface IsoFrame extends Frame {
  rows: Row[];
  ops: Op[];
  col: number;
  /** Versions a transaction just read: highlighted in the table. */
  saw: Saw[];
  /** Rows that exist but are invisible to the reader's snapshot. */
  hidden: string[];
  verdict: { tone: 'ok' | 'bad'; text: string } | null;
}

const isSnapshot = (level: Level) => level === 'si' || level === 'ser';

/** A row's newest committed value as the table shows it (versions are listed in write order). */
const committedValue = (row: Row) => [...row.versions].reverse().find((v) => v.st === 'c')?.v;

const hl = (tone: '' | 'ok' | 'bad', text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;

type Captions = (run: RunResult, level: Level) => { intro: ReactNode; steps: ReactNode[] };

const dirty: Captions = (run) => {
  const [write, read, , decide] = run.steps;
  const leaked = read.tone === 'bad';
  return {
    intro: <>Balance is $100. T1 will change it, then change its mind.</>,
    steps: [
      <>T1 writes {hl('', '$200')} but hasn't committed. The new version is <b>pending</b>.</>,
      leaked ? (
        <>T2 reads the {hl('bad', `uncommitted ${read.result}`)}. That's a dirty read.</>
      ) : (
        <>T2 only sees <b>committed</b> data, so it reads {hl('ok', read.result)}.</>
      ),
      <>T1 rolls back. The {write.rows[0].versions[write.rows[0].versions.length - 1].v} never officially existed.</>,
      decide.tone === 'bad' ? (
        <>T2 approved a loan based on money that {hl('bad', 'never existed')}.</>
      ) : (
        <>T2 decided on real, committed data and the loan was {decide.result}. In this toy model every level from Read Committed up prevents dirty reads.</>
      ),
    ],
  };
};

const nonrepeat: Captions = (run, level) => {
  const [first, , second] = run.steps;
  const sameAnswer = second.result === first.result;
  return {
    intro: <>T1 is building a report and reads the balance twice.</>,
    steps: [
      isSnapshot(level) ? (
        <>T1 reads {hl('', first.result)}, and takes a <b>snapshot</b>: it will keep seeing the database as of now.</>
      ) : (
        <>T1 reads {hl('', first.result)}.</>
      ),
      <>Meanwhile T2 changes the balance to $200 and commits. A new committed version appears.</>,
      sameAnswer ? (
        <>T1 reads the <b>old version</b> from its snapshot: still {hl('ok', second.result)}. That's MVCC: both versions exist at once.</>
      ) : (
        <>Same query, same transaction, now {hl('bad', second.result)}. T1's report adds up wrong.</>
      ),
    ],
  };
};

const phantom: Captions = (run) => {
  const [first, , second] = run.steps;
  const sameCount = second.result === first.result;
  return {
    intro: <>T1 counts the doctors on call, twice.</>,
    steps: [
      <>T1 counts {hl('', first.result)} doctors on call.</>,
      <>T2 adds a brand-new row, Carol, and commits. Nobody changed an existing row.</>,
      sameCount ? (
        <>Carol's row exists, but it was committed <b>after</b> T1's snapshot, so T1 still counts {hl('ok', second.result)}.</>
      ) : (
        <>The same query now returns {hl('bad', second.result)}. A <b>phantom</b> row appeared.</>
      ),
    ],
  };
};

const lost: Captions = (run) => {
  const [read1, read2, write1, write2, retry] = run.steps;
  const start = Number(read1.result);
  const stale = write2.aborted ? null : write2.sql.match(/= (\d+)/)?.[1];
  return {
    intro: <>A like counter at {start}, and two concurrent read-modify-writes.</>,
    steps: [
      <>Two people hit "like" at once. The app reads the count, adds one, writes it back.</>,
      <>T2 also reads {hl('', read2.result)}.</>,
      <>T1 writes {start} + 1 = {hl('', Number(write1.sql.match(/= (\d+)/)?.[1]))} and commits.</>,
      write2.aborted ? (
        <>
          T2 tries to overwrite a row that changed <b>after its snapshot</b>. The database refuses and {hl('', 'aborts T2')}: first committer
          wins.
        </>
      ) : (
        <>
          T2 writes its stale {start} + 1 = {stale} right over T1's. {hl('bad', 'One like vanished')}. (A real database avoids this with a
          single <code>UPDATE likes = likes + 1</code>, which reads and writes under one row lock; the toy engine doesn't model that.)
        </>
      ),
      ...(retry
        ? [
            <>
              The app <b>retries</b> T2, which now reads {start + 1} and writes {hl('ok', start + 2)}. The price of safety: your code must handle
              serialization errors.
            </>,
          ]
        : []),
    ],
  };
};

const skew: Captions = (run, level) => {
  const [count1, count2, , , , commit2] = run.steps;
  const onCall = run.steps[run.steps.length - 1].rows.filter((r) => committedValue(r) === 'true').length;
  return {
    intro: <>Two on-call doctors, and a rule: at least one must stay on call.</>,
    steps: [
      <>Rule: at least one doctor must be on call. Alice (T1) checks: {count1.result?.split(' ')[0]} on call, so she can go home.</>,
      <>At the same moment Bob (T2) checks. Also {count2.result?.split(' ')[0]}. He can go home too.</>,
      <>Alice takes herself off call.</>,
      <>Bob takes <b>himself</b> off call. Different rows, so there's no write conflict to catch.</>,
      <>Alice commits.</>,
      commit2.aborted ? (
        <>
          In this model, <b>Serializable</b> noticed that T2's decision was based on a row T1 changed, and T1's on a row T2 changed. No serial order
          explains both, so {hl('', 'T2 is aborted')}. Bob stays on call.
        </>
      ) : (
        <>
          Bob commits too. {hl('bad', onCall === 0 ? 'Zero doctors on call.' : `${onCall} on call.`)}{' '}
          {level === 'si' ? 'Even snapshot isolation misses this: the two transactions never wrote the same row.' : ''}
        </>
      ),
    ],
  };
};

const CAPTIONS: Record<AnomalyId, Captions> = { dirty, nonrepeat, phantom, lost, skew };

const VERDICT: Record<AnomalyId, { present: string; absent: (run: RunResult, level: Level) => string }> = {
  dirty: { present: 'Dirty read: T2 acted on data that was rolled back.', absent: () => 'Prevented: in this run T2 never saw uncommitted data.' },
  nonrepeat: {
    present: 'Non-repeatable read: same query, different answer inside one transaction.',
    absent: () => 'Prevented: T1 keeps reading its snapshot (the older version).',
  },
  phantom: { present: 'Phantom read: a row appeared out of nowhere between two identical queries.', absent: () => "Prevented: Carol's row isn't in T1's snapshot." },
  lost: {
    present: 'Lost update: two likes, the counter only went up by one.',
    absent: (_run, level) => `Prevented by aborting${level === 'si' ? " (as in Postgres; InnoDB's Repeatable Read lets this one through)" : ''}: the app retries and both likes count.`,
  },
  skew: {
    present: 'Write skew: each decision was valid alone; together, nobody is on call.',
    absent: () => "Prevented by aborting: this toy's simplified SSI noticed T2 read data T1 then changed.",
  },
};

export function buildFrames(anomaly: AnomalyId, level: Level): IsoFrame[] {
  const run = scriptedRun(anomaly, level);
  const { intro, steps } = CAPTIONS[anomaly](run, level);
  const ops: Op[] = [];
  const frames: IsoFrame[] = [{ rows: rowsOf(anomaly), ops: [], col: -1, saw: [], hidden: [], verdict: null, say: intro }];
  run.steps.forEach((step: StepRun, i) => {
    ops.push({ who: step.who, sql: step.sql, result: step.result, tone: step.tone, col: i });
    const last = i === run.steps.length - 1;
    const present = verdictOf(anomaly, level) === 'anomaly';
    frames.push({
      rows: step.rows,
      ops: ops.slice(),
      col: i,
      saw: step.saw,
      hidden: step.hidden,
      verdict: last ? { tone: present ? 'bad' : 'ok', text: present ? VERDICT[anomaly].present : VERDICT[anomaly].absent(run, level) } : null,
      say: steps[i],
    });
  });
  return frames;
}
