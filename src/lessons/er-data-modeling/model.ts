// Entities, relationships with crow's-foot cardinalities, and the tables they turn into:
// a foreign key on the "many" side, a unique one for 1:1, a join table for M:N.

export interface Entity {
  id: string;
  /** Singular, for column names: user → user_id. */
  name: string;
  /** Plural table name. */
  table: string;
  attrs: string[];
  /** Card position on the canvas (SVG units, top-left). */
  at: { x: number; y: number };
}

/** How many of THIS end's entity relate to one of the other end's: at least `min`, at most `max`. */
export interface End {
  entity: string;
  min: 0 | 1;
  max: '1' | 'N';
}

export type FkSide = 'auto' | 'a' | 'b';

export interface Relationship {
  id: string;
  label: string;
  a: End;
  b: End;
  /** Where to put the foreign key. 'auto' is the right place; the others allow the classic mistakes. */
  fkSide: FkSide;
  /** For M:N: the join table's name and any attributes of the relationship itself. */
  joinTable?: string;
  attrs?: string[];
  /** Column name when the FK can't be named after the other table (self-relations: manager_id). */
  fkName?: string;
  /** What each end is called when both ends are the same entity: manager and report. */
  roles?: { a: string; b: string };
}

/** The name for one end: its role in a self-relation, otherwise the entity's singular name. */
export const endName = (r: Relationship, side: 'a' | 'b', entities: Entity[]) => r.roles?.[side] ?? byId(entities, r[side].entity).name;

export type Kind = '1:1' | '1:N' | 'N:1' | 'M:N';
export const kindOf = (r: Relationship): Kind =>
  r.a.max === '1' ? (r.b.max === '1' ? '1:1' : '1:N') : r.b.max === '1' ? 'N:1' : 'M:N';

export type ColumnKind = 'pk' | 'attr' | 'fk' | 'error';

export interface Column {
  name: string;
  kind: ColumnKind;
  /** For foreign keys: the table.column it points at. */
  ref?: string;
  nullable?: boolean;
  unique?: boolean;
  /** Part of a composite primary key (join tables). */
  partOfKey?: boolean;
  note?: string;
}

export interface Table {
  name: string;
  /** A join table generated for an M:N relationship. */
  join: boolean;
  columns: Column[];
}

export interface Issue {
  relationship: string;
  text: string;
}

const byId = (entities: Entity[], id: string) => entities.find((e) => e.id === id)!;

/** The tables for this model, plus any modelling mistakes the FK placement causes. */
export function generateTables(entities: Entity[], rels: Relationship[]): { tables: Table[]; issues: Issue[] } {
  const tables = new Map<string, Table>(
    entities.map((e) => [e.id, { name: e.table, join: false, columns: [{ name: 'id', kind: 'pk' as const }, ...e.attrs.map((a) => ({ name: a, kind: 'attr' as const }))] }]),
  );
  const joins: Table[] = [];
  const issues: Issue[] = [];

  for (const r of rels) {
    const ea = byId(entities, r.a.entity);
    const eb = byId(entities, r.b.entity);
    const kind = kindOf(r);
    // A foreign key on `holder`'s table, pointing at `target`.
    const addFk = (holder: Entity, target: Entity, o: { nullable: boolean; unique?: boolean; note?: string }) => {
      tables.get(holder.id)!.columns.push({
        name: r.fkName ?? `${target.name}_id`, kind: 'fk', ref: `${target.table}.id`, nullable: o.nullable, unique: o.unique, note: o.note,
      });
    };
    const stuff = (holder: Entity, listName: string, text: string) => {
      tables.get(holder.id)!.columns.push({ name: `${listName}_ids`, kind: 'error', note: 'a list in one column' });
      issues.push({ relationship: r.id, text });
    };

    if (kind === 'M:N') {
      if (r.fkSide !== 'auto') {
        const [holder, targetSide] = r.fkSide === 'a' ? [ea, 'b' as const] : [eb, 'a' as const];
        const list = endName(r, targetSide, entities);
        stuff(holder, list, `An M:N relationship can't live in one table: ${holder.table}.${list}_ids would have to hold a list. Use a join table.`);
        continue;
      }
      const self = ea.id === eb.id;
      joins.push({
        name: r.joinTable ?? `${ea.table}_${eb.table}`,
        join: true,
        columns: [
          { name: self ? `${ea.name}_a_id` : `${ea.name}_id`, kind: 'fk', ref: `${ea.table}.id`, partOfKey: true },
          { name: self ? `${eb.name}_b_id` : `${eb.name}_id`, kind: 'fk', ref: `${eb.table}.id`, partOfKey: true },
          ...(r.attrs ?? []).map((a) => ({ name: a, kind: 'attr' as const, note: 'about the pair' })),
        ],
      });
      continue;
    }

    if (kind === '1:1') {
      // Either side works; by default the FK goes on b, unique. It may be null if b can exist without a.
      const onA = r.fkSide === 'a';
      const [holder, target, need] = onA ? [ea, eb, r.b.min] : [eb, ea, r.a.min];
      addFk(holder, target, { nullable: need === 0, unique: true, note: 'unique: one each' });
      continue;
    }

    // 1:N or N:1: the FK belongs on the many side.
    const [oneSide, manySide] = kind === '1:N' ? (['a', 'b'] as const) : (['b', 'a'] as const);
    const [one, many, oneEnd] = oneSide === 'a' ? [ea, eb, r.a] : [eb, ea, r.b];
    if (r.fkSide === oneSide) {
      const [oneName, manyName] = [endName(r, oneSide, entities), endName(r, manySide, entities)];
      const where = r.roles ? `each ${manyName}'s row` : many.table;
      stuff(one, manyName, `A ${oneName}'s row can't hold the link: one ${oneName} has many ${manyName}s, so it would need a list of ${manyName}_ids. The foreign key belongs on ${where}.`);
      continue;
    }
    addFk(many, one, { nullable: oneEnd.min === 0 });
  }

  return { tables: [...tables.values(), ...joins], issues };
}

/** Plain-words reading of a relationship: "one user has many orders". */
export function describe(r: Relationship, entities: Entity[]): string {
  const plural = (side: 'a' | 'b') => (r.roles ? `${r.roles[side]}s` : byId(entities, r[side].entity).table);
  const count = (side: 'a' | 'b') => {
    const e = r[side];
    return e.max === 'N' ? `${e.min === 0 ? 'zero or more' : 'one or more'} ${plural(side)}` : `${e.min === 0 ? 'zero or one' : 'exactly one'} ${endName(r, side, entities)}`;
  };
  return `Each ${endName(r, 'a', entities)} has ${count('b')}; each ${endName(r, 'b', entities)} has ${count('a')}.`;
}

// ── Presets ─────────────────────────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  entities: Entity[];
  rels: Relationship[];
}

export const PRESETS: Preset[] = [
  {
    id: 'shop',
    label: 'A shop',
    entities: [
      { id: 'user', name: 'user', table: 'users', attrs: ['email', 'name'], at: { x: 30, y: 40 } },
      { id: 'order', name: 'order', table: 'orders', attrs: ['placed_at', 'status'], at: { x: 330, y: 40 } },
      { id: 'product', name: 'product', table: 'products', attrs: ['name', 'price'], at: { x: 630, y: 40 } },
      { id: 'address', name: 'address', table: 'addresses', attrs: ['street', 'city'], at: { x: 30, y: 230 } },
    ],
    rels: [
      { id: 'places', label: 'places', a: { entity: 'user', min: 1, max: '1' }, b: { entity: 'order', min: 0, max: 'N' }, fkSide: 'auto' },
      { id: 'contains', label: 'contains', a: { entity: 'order', min: 0, max: 'N' }, b: { entity: 'product', min: 1, max: 'N' }, fkSide: 'auto', joinTable: 'order_items', attrs: ['quantity', 'unit_price'] },
      { id: 'lives', label: 'has', a: { entity: 'user', min: 1, max: '1' }, b: { entity: 'address', min: 0, max: 'N' }, fkSide: 'auto' },
    ],
  },
  {
    id: 'blog',
    label: 'A blog with tags',
    entities: [
      { id: 'user', name: 'author', table: 'authors', attrs: ['name'], at: { x: 30, y: 40 } },
      { id: 'post', name: 'post', table: 'posts', attrs: ['title', 'body'], at: { x: 330, y: 40 } },
      { id: 'tag', name: 'tag', table: 'tags', attrs: ['name'], at: { x: 630, y: 40 } },
      { id: 'profile', name: 'profile', table: 'profiles', attrs: ['bio', 'avatar_url'], at: { x: 30, y: 230 } },
    ],
    rels: [
      { id: 'writes', label: 'writes', a: { entity: 'user', min: 1, max: '1' }, b: { entity: 'post', min: 0, max: 'N' }, fkSide: 'auto' },
      { id: 'tagged', label: 'tagged', a: { entity: 'post', min: 0, max: 'N' }, b: { entity: 'tag', min: 0, max: 'N' }, fkSide: 'auto', joinTable: 'post_tags' },
      { id: 'about', label: 'has', a: { entity: 'user', min: 1, max: '1' }, b: { entity: 'profile', min: 0, max: '1' }, fkSide: 'auto' },
    ],
  },
  {
    id: 'school',
    label: 'A school',
    entities: [
      { id: 'teacher', name: 'teacher', table: 'teachers', attrs: ['name'], at: { x: 30, y: 40 } },
      { id: 'course', name: 'course', table: 'courses', attrs: ['title', 'term'], at: { x: 330, y: 40 } },
      { id: 'student', name: 'student', table: 'students', attrs: ['name', 'year'], at: { x: 630, y: 40 } },
    ],
    rels: [
      { id: 'teaches', label: 'teaches', a: { entity: 'teacher', min: 1, max: '1' }, b: { entity: 'course', min: 0, max: 'N' }, fkSide: 'auto' },
      { id: 'enrolled', label: 'enrolled in', a: { entity: 'course', min: 0, max: 'N' }, b: { entity: 'student', min: 0, max: 'N' }, fkSide: 'auto', joinTable: 'enrolments', attrs: ['grade'] },
    ],
  },
  {
    id: 'org',
    label: 'An org chart (self-relation)',
    entities: [
      { id: 'employee', name: 'employee', table: 'employees', attrs: ['name', 'title'], at: { x: 330, y: 40 } },
      { id: 'dept', name: 'department', table: 'departments', attrs: ['name'], at: { x: 30, y: 40 } },
    ],
    rels: [
      { id: 'manages', label: 'manages', a: { entity: 'employee', min: 0, max: '1' }, b: { entity: 'employee', min: 0, max: 'N' }, fkSide: 'auto', fkName: 'manager_id', roles: { a: 'manager', b: 'report' } },
      { id: 'works', label: 'employs', a: { entity: 'dept', min: 1, max: '1' }, b: { entity: 'employee', min: 1, max: 'N' }, fkSide: 'auto' },
    ],
  },
];
