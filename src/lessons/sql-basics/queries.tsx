// Frame builders for each query: they step the shared tables (data.ts) through SQL's
// logical execution order, with a caption per milestone.
import type { ReactNode } from 'react';
import { ORDERS, USERS, type Mark, type ResultRow, type SqlFrame, type Step } from './data';
export interface Query {
  id: string;
  label: string;
  /** SQL split into tokens, each tagged with the clause (step) it belongs to */
  sql: { text: string; step: Step }[];
  /** logical execution order */
  steps: Step[];
  usesOrders: boolean;
  build: () => SqlFrame[];
}

function builder() {
  let s: SqlFrame = {
    step: null, done: [], users: {}, orders: {}, dimUserCols: [], dimOrderCols: [],
    links: [], resultCols: [], result: [], examined: 0,
  };
  const frames: SqlFrame[] = [];
  return {
    frames,
    get: () => s,
    set(p: Partial<SqlFrame>) {
      s = { ...s, ...p };
    },
    enter(step: Step | null) {
      const done = s.step && !s.done.includes(s.step) ? [...s.done, s.step] : s.done;
      s = { ...s, done, step };
    },
    user(id: number, m: Mark) {
      s = { ...s, users: { ...s.users, [id]: m } };
    },
    order(id: number, m: Mark) {
      s = { ...s, orders: { ...s.orders, [id]: m } };
    },
    push(row: ResultRow) {
      s = { ...s, result: [...s.result, row] };
    },
    link(u: number, o: number) {
      s = { ...s, links: [...s.links, { u, o }] };
    },
    snap(say?: ReactNode, hold?: number) {
      frames.push({ ...s, say, hold });
    },
  };
}

const kw = (text: string, step: Step) => ({ text, step });

const byName = (a: ResultRow, b: ResultRow) => String(a.cells[0]).localeCompare(String(b.cells[0]));

function selectAll(): SqlFrame[] {
  const b = builder();
  b.enter('FROM');
  b.snap(<>SQL starts at <b>FROM</b>, not SELECT: grab the <span className="hl info">users</span> table.</>);
  b.enter('SELECT');
  b.set({ dimUserCols: ['id'], resultCols: ['name', 'city'] });
  b.snap(<>SELECT keeps only <span className="hl">name</span> and <span className="hl">city</span>. The id column stays behind.</>);
  USERS.forEach((u, i) => {
    b.user(u.id, 'scan');
    b.set({ examined: b.get().examined + 1 });
    b.push({ key: `u${u.id}`, cells: [u.name, u.city] });
    b.snap(i === 0 ? <>Every row is copied into the result, minus the id.</> : undefined, 0.6);
    b.user(u.id, 'match');
  });
  b.enter(null);
  b.snap(<>5 rows in, <span className="hl ok">5 rows out</span>, 2 columns. No WHERE means every row survives.</>, 2);
  return b.frames;
}

function where(): SqlFrame[] {
  const b = builder();
  b.enter('FROM');
  b.snap(<>First <b>FROM</b>: start with every row of <span className="hl info">users</span>.</>);
  b.enter('WHERE');
  USERS.forEach((u) => {
    b.user(u.id, 'scan');
    b.set({ examined: b.get().examined + 1 });
    b.snap(<>WHERE checks each row: is <b>{u.name}</b>'s city <span className="hl">'London'</span>?</>, 0.7);
    const keep = u.city === 'London';
    b.user(u.id, keep ? 'match' : 'out');
    b.snap(
      keep ? (
        <><span className="hl ok">{u.city}</span>: yes, {u.name} stays.</>
      ) : (
        <><span className="hl bad">{u.city}</span>: no, {u.name} is filtered out.</>
      ),
      0.7,
    );
  });
  b.enter('SELECT');
  b.set({ dimUserCols: ['id'], resultCols: ['name', 'city'] });
  USERS.filter((u) => u.city === 'London').forEach((u) => b.push({ key: `u${u.id}`, cells: [u.name, u.city] }));
  b.snap(<>Only now does <b>SELECT</b> pick columns, from the 2 rows that survived.</>);
  b.enter(null);
  b.snap(
    <>Written <b>SELECT → FROM → WHERE</b>, but run <span className="hl">FROM → WHERE → SELECT</span>. That's why
      you can't use a SELECT alias inside WHERE.</>,
    2.2,
  );
  return b.frames;
}

function orderBy(): SqlFrame[] {
  const b = builder();
  b.enter('FROM');
  b.snap(<><b>FROM</b> users.</>);
  b.enter('SELECT');
  b.set({ dimUserCols: ['id'], resultCols: ['name', 'city'] });
  USERS.forEach((u, i) => {
    b.user(u.id, 'scan');
    b.set({ examined: b.get().examined + 1 });
    b.push({ key: `u${u.id}`, cells: [u.name, u.city] });
    b.snap(i === 0 ? <>SELECT copies rows in whatever order they're stored…</> : undefined, 0.5);
    b.user(u.id, 'match');
  });
  b.snap(<>…which is <span className="hl bad">not guaranteed</span> to be any particular order.</>);
  b.enter('ORDER BY');
  b.set({ result: b.get().result.slice().sort(byName) });
  b.snap(<><b>ORDER BY name</b> runs last and sorts the finished result alphabetically.</>, 1.4);
  b.enter(null);
  b.snap(<>Need a specific order? Say so with <span className="hl">ORDER BY</span>. Without it, the database may return rows in any order.</>, 2);
  return b.frames;
}

function join(left: boolean): SqlFrame[] {
  const b = builder();
  b.enter('FROM');
  b.snap(<><b>FROM</b> users: the left side of the join.</>);
  b.enter('JOIN');
  b.set({ resultCols: ['name', 'item'] });
  b.snap(
    <><b>{left ? 'LEFT JOIN' : 'JOIN'}</b> orders <b>ON</b> orders.user_id = users.id: for each user, find orders
      pointing at their id.</>,
  );
  USERS.forEach((u) => {
    b.user(u.id, 'scan');
    b.set({ examined: b.get().examined + ORDERS.length });
    const mine = ORDERS.filter((o) => o.userId === u.id);
    mine.forEach((o) => {
      b.order(o.id, 'match');
      b.link(u.id, o.id);
      b.push({ key: `j${u.id}-${o.id}`, cells: [u.name, o.item] });
    });
    if (mine.length) {
      b.snap(
        <><b>{u.name}</b> (id {u.id}) matches <span className="hl ok">{mine.length} order{mine.length > 1 ? 's' : ''}</span>.
          Each match becomes its own row.</>,
      );
      b.user(u.id, 'match');
    } else if (left) {
      b.push({ key: `j${u.id}-null`, cells: [u.name, null] });
      b.snap(
        <><b>{u.name}</b> has no orders, but LEFT JOIN <span className="hl ok">keeps every left row</span>, filling
          item with <span className="hl violet">NULL</span>.</>,
      );
      b.user(u.id, 'match');
    } else {
      b.user(u.id, 'out');
      b.snap(<><b>{u.name}</b> has no orders, so an inner JOIN <span className="hl bad">drops them</span>.</>);
    }
  });
  b.enter('SELECT');
  b.set({ dimUserCols: ['id', 'city'], dimOrderCols: ['id', 'user_id', 'total'] });
  b.snap(<><b>SELECT</b> keeps just users.name and orders.item from each joined row.</>);
  b.enter(null);
  b.snap(
    left ? (
      <>{USERS.length} users → <span className="hl ok">{b.get().result.length} rows</span>: Ada appears 3 times, and
        Linus and Margaret survive with NULLs.</>
    ) : (
      <>{USERS.length} users → <span className="hl ok">{b.get().result.length} rows</span>. Ada appears 3 times;
        Linus and Margaret vanish. Use LEFT JOIN to keep them.</>
    ),
    2.2,
  );
  return b.frames;
}

function groupBy(): SqlFrame[] {
  const b = builder();
  b.enter('FROM');
  b.snap(<><b>FROM</b> users…</>);
  b.enter('JOIN');
  b.set({ resultCols: ['name', 'item'] });
  USERS.forEach((u, i) => {
    b.user(u.id, 'scan');
    b.set({ examined: b.get().examined + ORDERS.length });
    const mine = ORDERS.filter((o) => o.userId === u.id);
    mine.forEach((o) => {
      b.order(o.id, 'match');
      b.link(u.id, o.id);
      b.push({ key: `j${u.id}-${o.id}`, cells: [u.name, o.item], userId: u.id });
    });
    b.snap(i === 0 ? <>…JOIN orders, exactly like the JOIN query: one row per matching order.</> : undefined, 0.6);
    b.user(u.id, mine.length ? 'match' : 'out');
  });
  b.enter('GROUP BY');
  // Group on the user's id (names aren't guaranteed unique), in the order rows arrived.
  const ids = [...new Set(b.get().result.map((r) => r.userId!))];
  b.set({ result: b.get().result.map((r) => ({ ...r, tint: ids.indexOf(r.userId!) })) });
  b.snap(<><b>GROUP BY users.id</b> puts each user's rows into one bucket (same colour).</>, 1.3);
  const groups = ids.map((id, i) => ({
    key: `g-${id}`,
    cells: [USERS.find((u) => u.id === id)!.name, b.get().result.filter((r) => r.userId === id).length],
    userId: id,
    tint: i,
  }));
  b.set({ result: groups, resultCols: ['name', 'orders'] });
  b.snap(<>…then each bucket collapses to <span className="hl">one row</span>, and <b>COUNT</b> counts the rows inside it.</>, 1.4);
  b.enter('SELECT');
  b.set({ dimUserCols: ['id', 'city'], dimOrderCols: ['user_id', 'item', 'total'] });
  b.snap(<><b>SELECT</b> returns each user's name and their count.</>);
  b.enter(null);
  b.snap(
    <>{b.get().result.length} groups. After GROUP BY you can only SELECT the grouped columns or aggregates like COUNT,
      SUM and AVG. There's no ORDER BY, so the groups can come back in any order.</>,
    2.2,
  );
  return b.frames;
}

export const QUERIES: Query[] = [
  {
    id: 'select', label: 'SELECT', usesOrders: false, steps: ['FROM', 'SELECT'],
    sql: [kw('SELECT name, city', 'SELECT'), kw('FROM users', 'FROM')],
    build: selectAll,
  },
  {
    id: 'where', label: 'WHERE', usesOrders: false, steps: ['FROM', 'WHERE', 'SELECT'],
    sql: [kw('SELECT name, city', 'SELECT'), kw('FROM users', 'FROM'), kw("WHERE city = 'London'", 'WHERE')],
    build: where,
  },
  {
    id: 'order', label: 'ORDER BY', usesOrders: false, steps: ['FROM', 'SELECT', 'ORDER BY'],
    sql: [kw('SELECT name, city', 'SELECT'), kw('FROM users', 'FROM'), kw('ORDER BY name', 'ORDER BY')],
    build: orderBy,
  },
  {
    id: 'join', label: 'JOIN', usesOrders: true, steps: ['FROM', 'JOIN', 'SELECT'],
    sql: [
      kw('SELECT users.name, orders.item', 'SELECT'), kw('FROM users', 'FROM'),
      kw('JOIN orders ON orders.user_id = users.id', 'JOIN'),
    ],
    build: () => join(false),
  },
  {
    id: 'left', label: 'LEFT JOIN', usesOrders: true, steps: ['FROM', 'JOIN', 'SELECT'],
    sql: [
      kw('SELECT users.name, orders.item', 'SELECT'), kw('FROM users', 'FROM'),
      kw('LEFT JOIN orders ON orders.user_id = users.id', 'JOIN'),
    ],
    build: () => join(true),
  },
  {
    id: 'group', label: 'GROUP BY', usesOrders: true, steps: ['FROM', 'JOIN', 'GROUP BY', 'SELECT'],
    sql: [
      kw('SELECT users.name, COUNT(*) AS orders', 'SELECT'), kw('FROM users', 'FROM'),
      kw('JOIN orders ON orders.user_id = users.id', 'JOIN'), kw('GROUP BY users.id, users.name', 'GROUP BY'),
    ],
    build: groupBy,
  },
];
