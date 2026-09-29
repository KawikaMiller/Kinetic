import type { ReactNode } from 'react';

export type Level = 'ru' | 'rc' | 'si' | 'ser';
export type AnomalyId = 'dirty' | 'nonrepeat' | 'phantom' | 'lost' | 'skew';
export type Tx = 'T0' | 'T1' | 'T2';
export type Tone = 'ok' | 'bad' | 'hi' | 'info' | '';
/** What a level does about an anomaly. */
export type Outcome = 'happens' | 'prevented' | 'aborted';

export interface Version {
  v: string;
  by: Tx;
  /** c = committed, p = pending (uncommitted), x = rolled back / aborted */
  st: 'c' | 'p' | 'x';
}

export interface Row {
  key: string;
  label: string;
  versions: Version[];
}

export interface Op {
  who: 'T1' | 'T2';
  sql: string;
  result?: string;
  tone?: Tone;
  col: number;
}

export interface Snapshot {
  rows: Row[];
  ops: Op[];
  col: number;
  /** Versions a transaction just read: highlighted in the table. */
  saw: { key: string; idx: number; who: 'T1' | 'T2' }[];
  /** Rows that exist but are invisible to the reader's snapshot. */
  hidden: string[];
  verdict: { tone: Tone; text: string } | null;
  say: ReactNode;
}

export const LEVELS: { id: Level; label: string; short: string }[] = [
  { id: 'ru', label: 'Read Uncommitted', short: 'RU' },
  { id: 'rc', label: 'Read Committed', short: 'RC' },
  { id: 'si', label: 'Repeatable Read / Snapshot', short: 'RR / SI' },
  { id: 'ser', label: 'Serializable', short: 'SER' },
];

export const ANOMALIES: { id: AnomalyId; label: string; blurb: string }[] = [
  { id: 'dirty', label: 'Dirty read', blurb: 'reading data another transaction never committed' },
  { id: 'nonrepeat', label: 'Non-repeatable read', blurb: 'the same row changes between two reads' },
  { id: 'phantom', label: 'Phantom read', blurb: 'new rows appear in a repeated query' },
  { id: 'lost', label: 'Lost update', blurb: 'two read-modify-writes, one silently overwritten' },
  { id: 'skew', label: 'Write skew', blurb: 'two valid decisions that together break a rule' },
];

/** Behaviour as implemented by snapshot-based engines (e.g. Postgres). */
export const MATRIX: Record<AnomalyId, Record<Level, Outcome>> = {
  dirty: { ru: 'happens', rc: 'prevented', si: 'prevented', ser: 'prevented' },
  nonrepeat: { ru: 'happens', rc: 'happens', si: 'prevented', ser: 'prevented' },
  phantom: { ru: 'happens', rc: 'happens', si: 'prevented', ser: 'prevented' },
  lost: { ru: 'happens', rc: 'happens', si: 'aborted', ser: 'aborted' },
  skew: { ru: 'happens', rc: 'happens', si: 'happens', ser: 'aborted' },
};

// ─── tiny MVCC table helpers ─────────────────────────────────────────
const clone = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, versions: r.versions.map((v) => ({ ...v })) }));
const row = (rows: Row[], key: string) => rows.find((r) => r.key === key)!;
const write = (rows: Row[], key: string, v: string, by: Tx) => {
  row(rows, key).versions.push({ v, by, st: 'p' });
};
const settle = (rows: Row[], by: Tx, st: 'c' | 'x') => {
  for (const r of rows) for (const v of r.versions) if (v.by === by && v.st === 'p') v.st = st;
};
const commit = (rows: Row[], by: Tx) => settle(rows, by, 'c');
const abort = (rows: Row[], by: Tx) => settle(rows, by, 'x');
const lastIdx = (r: Row, pred: (v: Version) => boolean) => {
  for (let i = r.versions.length - 1; i >= 0; i--) if (pred(r.versions[i])) return i;
  return -1;
};

interface StepDef {
  op?: Omit<Op, 'col'>;
  apply?: (rows: Row[]) => void;
  saw?: (rows: Row[]) => Snapshot['saw'];
  hidden?: string[];
  verdict?: Snapshot['verdict'];
  say: ReactNode;
}

function run(rows0: Row[], intro: ReactNode, steps: StepDef[]): Snapshot[] {
  let rows = clone(rows0);
  const ops: Op[] = [];
  const out: Snapshot[] = [{ rows, ops: [], col: -1, saw: [], hidden: [], verdict: null, say: intro }];
  steps.forEach((s, i) => {
    rows = clone(rows);
    s.apply?.(rows);
    if (s.op) ops.push({ ...s.op, col: i });
    out.push({
      rows,
      ops: ops.slice(),
      col: i,
      saw: s.saw?.(rows) ?? [],
      hidden: s.hidden ?? [],
      verdict: s.verdict ?? null,
      say: s.say,
    });
  });
  return out;
}

const committedIdx = (r: Row) => lastIdx(r, (v) => v.st === 'c');

// ─── scenarios ───────────────────────────────────────────────────────
function dirty(level: Level): Snapshot[] {
  const rows0: Row[] = [{ key: 'acct', label: 'balance', versions: [{ v: '$100', by: 'T0', st: 'c' }] }];
  const leaks = level === 'ru';
  return run(rows0, <>Balance is $100. T1 will change it, then change its mind.</>, [
    {
      op: { who: 'T1', sql: 'UPDATE balance = 200' },
      apply: (r) => write(r, 'acct', '$200', 'T1'),
      say: (
        <>
          T1 writes <span className="hl">$200</span> but hasn't committed. The new version is <b>pending</b>.
        </>
      ),
    },
    {
      op: { who: 'T2', sql: 'SELECT balance', result: leaks ? '$200' : '$100', tone: leaks ? 'bad' : 'ok' },
      saw: (r) => [{ key: 'acct', idx: leaks ? lastIdx(row(r, 'acct'), () => true) : committedIdx(row(r, 'acct')), who: 'T2' }],
      say: leaks ? (
        <>
          T2 reads the <span className="hl bad">uncommitted $200</span>. That's a dirty read.
        </>
      ) : (
        <>
          T2 only sees <b>committed</b> data, so it reads <span className="hl ok">$100</span>.
        </>
      ),
    },
    {
      op: { who: 'T1', sql: 'ROLLBACK', tone: 'hi' },
      apply: (r) => abort(r, 'T1'),
      say: <>T1 rolls back. The $200 never officially existed.</>,
    },
    {
      op: { who: 'T2', sql: 'approve loan if balance ≥ 150', result: leaks ? 'approved' : 'denied', tone: leaks ? 'bad' : 'ok' },
      verdict: leaks ? { tone: 'bad', text: 'Dirty read: T2 acted on data that was rolled back.' } : { tone: 'ok', text: 'Prevented: T2 never saw uncommitted data.' },
      say: leaks ? (
        <>
          T2 approved a loan based on money that <span className="hl bad">never existed</span>.
        </>
      ) : (
        <>T2 decided on real, committed data. Every level from Read Committed up prevents dirty reads.</>
      ),
    },
  ]);
}

function nonrepeat(level: Level): Snapshot[] {
  const rows0: Row[] = [{ key: 'acct', label: 'balance', versions: [{ v: '$100', by: 'T0', st: 'c' }] }];
  const snap = level === 'si' || level === 'ser';
  return run(rows0, <>T1 is building a report and reads the balance twice.</>, [
    {
      op: { who: 'T1', sql: 'SELECT balance', result: '$100', tone: 'ok' },
      saw: () => [{ key: 'acct', idx: 0, who: 'T1' }],
      say: snap ? (
        <>
          T1 reads <span className="hl">$100</span>, and takes a <b>snapshot</b>: it will keep seeing the database as of
          now.
        </>
      ) : (
        <>
          T1 reads <span className="hl">$100</span>.
        </>
      ),
    },
    {
      op: { who: 'T2', sql: 'UPDATE balance = 200; COMMIT', tone: 'info' },
      apply: (r) => {
        write(r, 'acct', '$200', 'T2');
        commit(r, 'T2');
      },
      say: <>Meanwhile T2 changes the balance to $200 and commits. A new committed version appears.</>,
    },
    {
      op: { who: 'T1', sql: 'SELECT balance', result: snap ? '$100' : '$200', tone: snap ? 'ok' : 'bad' },
      saw: () => [{ key: 'acct', idx: snap ? 0 : 1, who: 'T1' }],
      verdict: snap
        ? { tone: 'ok', text: 'Prevented: T1 keeps reading its snapshot (the older version).' }
        : { tone: 'bad', text: 'Non-repeatable read: same query, different answer inside one transaction.' },
      say: snap ? (
        <>
          T1 reads the <b>old version</b> from its snapshot: still <span className="hl ok">$100</span>. That's MVCC:
          both versions exist at once.
        </>
      ) : (
        <>
          Same query, same transaction, now <span className="hl bad">$200</span>. T1's report adds up wrong.
        </>
      ),
    },
  ]);
}

function phantom(level: Level): Snapshot[] {
  const rows0: Row[] = [
    { key: 'alice', label: 'Alice on_call', versions: [{ v: 'true', by: 'T0', st: 'c' }] },
    { key: 'bob', label: 'Bob on_call', versions: [{ v: 'true', by: 'T0', st: 'c' }] },
  ];
  const snap = level === 'si' || level === 'ser';
  const both = (who: 'T1' | 'T2') => () => [
    { key: 'alice', idx: 0, who },
    { key: 'bob', idx: 0, who },
  ];
  return run(rows0, <>T1 counts the doctors on call, twice.</>, [
    {
      op: { who: 'T1', sql: 'SELECT count(*) WHERE on_call', result: '2', tone: 'ok' },
      saw: both('T1'),
      say: <>T1 counts <span className="hl">2</span> doctors on call.</>,
    },
    {
      op: { who: 'T2', sql: "INSERT Carol on_call; COMMIT", tone: 'info' },
      apply: (r) => r.push({ key: 'carol', label: 'Carol on_call', versions: [{ v: 'true', by: 'T2', st: 'c' }] }),
      say: <>T2 adds a brand-new row, Carol, and commits. Nobody changed an existing row.</>,
    },
    {
      op: { who: 'T1', sql: 'SELECT count(*) WHERE on_call', result: snap ? '2' : '3', tone: snap ? 'ok' : 'bad' },
      saw: snap
        ? both('T1')
        : () => [
            { key: 'alice', idx: 0, who: 'T1' },
            { key: 'bob', idx: 0, who: 'T1' },
            { key: 'carol', idx: 0, who: 'T1' },
          ],
      hidden: snap ? ['carol'] : [],
      verdict: snap
        ? { tone: 'ok', text: "Prevented: Carol's row isn't in T1's snapshot." }
        : { tone: 'bad', text: 'Phantom read: a row appeared out of nowhere between two identical queries.' },
      say: snap ? (
        <>
          Carol's row exists, but it was committed <b>after</b> T1's snapshot, so T1 still counts{' '}
          <span className="hl ok">2</span>.
        </>
      ) : (
        <>
          The same query now returns <span className="hl bad">3</span>. A <b>phantom</b> row appeared.
        </>
      ),
    },
  ]);
}

function lost(level: Level): Snapshot[] {
  const rows0: Row[] = [{ key: 'likes', label: 'likes', versions: [{ v: '10', by: 'T0', st: 'c' }] }];
  const guarded = level === 'si' || level === 'ser';
  const steps: StepDef[] = [
    {
      op: { who: 'T1', sql: 'SELECT likes', result: '10' },
      saw: () => [{ key: 'likes', idx: 0, who: 'T1' }],
      say: <>Two people hit "like" at once. The app reads the count, adds one, writes it back.</>,
    },
    {
      op: { who: 'T2', sql: 'SELECT likes', result: '10' },
      saw: () => [{ key: 'likes', idx: 0, who: 'T2' }],
      say: <>T2 also reads <span className="hl">10</span>.</>,
    },
    {
      op: { who: 'T1', sql: 'UPDATE likes = 11; COMMIT', tone: 'info' },
      apply: (r) => {
        write(r, 'likes', '11', 'T1');
        commit(r, 'T1');
      },
      say: <>T1 writes 10 + 1 = <span className="hl">11</span> and commits.</>,
    },
  ];
  if (!guarded) {
    steps.push({
      op: { who: 'T2', sql: 'UPDATE likes = 11; COMMIT', result: 'ok', tone: 'bad' },
      apply: (r) => {
        write(r, 'likes', '11', 'T2');
        commit(r, 'T2');
      },
      verdict: { tone: 'bad', text: 'Lost update: two likes, the counter only went up by one.' },
      say: (
        <>
          T2 writes its stale 10 + 1 = 11 right over T1's. <span className="hl bad">One like vanished</span>. (A single{' '}
          <code>UPDATE likes = likes + 1</code> would have avoided it at any level.)
        </>
      ),
    });
  } else {
    steps.push(
      {
        op: { who: 'T2', sql: 'UPDATE likes = 11', result: 'ERROR: could not serialize', tone: 'hi' },
        apply: (r) => abort(r, 'T2'),
        say: (
          <>
            T2 tries to overwrite a row that changed <b>after its snapshot</b>. The database refuses and{' '}
            <span className="hl">aborts T2</span>: first committer wins.
          </>
        ),
      },
      {
        op: { who: 'T2', sql: 'retry: read 11, write 12; COMMIT', result: 'ok', tone: 'ok' },
        apply: (r) => {
          write(r, 'likes', '12', 'T2');
          commit(r, 'T2');
        },
        verdict: { tone: 'ok', text: 'Prevented by aborting: the app retries and both likes count.' },
        say: (
          <>
            The app <b>retries</b> T2, which now reads 11 and writes <span className="hl ok">12</span>. The price of
            safety: your code must handle serialization errors.
          </>
        ),
      },
    );
  }
  return run(rows0, <>A like counter at 10, and two concurrent read-modify-writes.</>, steps);
}

function skew(level: Level): Snapshot[] {
  const rows0: Row[] = [
    { key: 'alice', label: 'Alice on_call', versions: [{ v: 'true', by: 'T0', st: 'c' }] },
    { key: 'bob', label: 'Bob on_call', versions: [{ v: 'true', by: 'T0', st: 'c' }] },
  ];
  const ser = level === 'ser';
  const count = (who: 'T1' | 'T2') => () => [
    { key: 'alice', idx: 0, who },
    { key: 'bob', idx: 0, who },
  ];
  const steps: StepDef[] = [
    {
      op: { who: 'T1', sql: 'count on_call', result: '2 → ok to leave', tone: 'ok' },
      saw: count('T1'),
      say: <>Rule: at least one doctor must be on call. Alice (T1) checks: 2 on call, so she can go home.</>,
    },
    {
      op: { who: 'T2', sql: 'count on_call', result: '2 → ok to leave', tone: 'ok' },
      saw: count('T2'),
      say: <>At the same moment Bob (T2) checks. Also 2. He can go home too.</>,
    },
    {
      op: { who: 'T1', sql: 'UPDATE Alice on_call = false' },
      apply: (r) => write(r, 'alice', 'false', 'T1'),
      say: <>Alice takes herself off call.</>,
    },
    {
      op: { who: 'T2', sql: 'UPDATE Bob on_call = false' },
      apply: (r) => write(r, 'bob', 'false', 'T2'),
      say: (
        <>
          Bob takes <b>himself</b> off call. Different rows, so there's no write conflict to catch.
        </>
      ),
    },
    {
      op: { who: 'T1', sql: 'COMMIT', result: 'ok', tone: 'ok' },
      apply: (r) => commit(r, 'T1'),
      say: <>Alice commits.</>,
    },
  ];
  if (ser) {
    steps.push({
      op: { who: 'T2', sql: 'COMMIT', result: 'ERROR: could not serialize', tone: 'hi' },
      apply: (r) => abort(r, 'T2'),
      verdict: { tone: 'ok', text: 'Prevented by aborting: Serializable noticed T2 read data T1 then changed.' },
      say: (
        <>
          <b>Serializable</b> tracked that T2's decision was based on a row T1 changed. No serial order explains both,
          so <span className="hl">T2 is aborted</span>. Bob stays on call.
        </>
      ),
    });
  } else {
    steps.push({
      op: { who: 'T2', sql: 'COMMIT', result: 'ok', tone: 'bad' },
      apply: (r) => commit(r, 'T2'),
      verdict: { tone: 'bad', text: 'Write skew: each decision was valid alone; together, nobody is on call.' },
      say: (
        <>
          Bob commits too. <span className="hl bad">Zero doctors on call.</span>{' '}
          {level === 'si' ? 'Even snapshot isolation misses this: the two transactions never wrote the same row.' : ''}
        </>
      ),
    });
  }
  return run(rows0, <>Two on-call doctors, and a rule: at least one must stay on call.</>, steps);
}

export const SCENARIOS: Record<AnomalyId, (level: Level) => Snapshot[]> = { dirty, nonrepeat, phantom, lost, skew };
