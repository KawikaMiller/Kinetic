import { describe, expect, it } from 'vitest';
import { PRESETS, describe as describeRel, generateTables, kindOf, type End, type Entity, type FkSide, type Relationship } from './model';

const E = (id: string, attrs: string[] = []): Entity => ({ id, name: id, table: `${id}s`, attrs, at: { x: 0, y: 0 } });
const A = E('author');
const B = E('book');
const rel = (a: Omit<End, 'entity'>, b: Omit<End, 'entity'>, fkSide: FkSide = 'auto', extra: Partial<Relationship> = {}): Relationship => ({
  id: 'r', label: 'r', a: { entity: 'author', ...a }, b: { entity: 'book', ...b }, fkSide, ...extra,
});
const tablesFor = (r: Relationship, ents: Entity[] = [A, B]) => generateTables(ents, [r]);
const cols = (out: ReturnType<typeof generateTables>, table: string) => out.tables.find((t) => t.name === table)!.columns;

describe('kinds', () => {
  it('reads the two maxima', () => {
    expect(kindOf(rel({ min: 1, max: '1' }, { min: 0, max: 'N' }))).toBe('1:N');
    expect(kindOf(rel({ min: 0, max: 'N' }, { min: 1, max: '1' }))).toBe('N:1');
    expect(kindOf(rel({ min: 0, max: '1' }, { min: 0, max: '1' }))).toBe('1:1');
    expect(kindOf(rel({ min: 0, max: 'N' }, { min: 0, max: 'N' }))).toBe('M:N');
  });
});

describe('table generation for every cardinality pair', () => {
  it('1:N puts the FK on the many side, NOT NULL when the one side is required', () => {
    const out = tablesFor(rel({ min: 1, max: '1' }, { min: 0, max: 'N' }));
    expect(cols(out, 'books')).toContainEqual({ name: 'author_id', kind: 'fk', ref: 'authors.id', nullable: false, unique: undefined, note: undefined });
    expect(cols(out, 'authors').some((c) => c.kind === 'fk')).toBe(false);
    expect(out.issues).toEqual([]);
  });
  it('an optional one side makes the FK nullable', () => {
    const out = tablesFor(rel({ min: 0, max: '1' }, { min: 0, max: 'N' }));
    expect(cols(out, 'books').find((c) => c.name === 'author_id')!.nullable).toBe(true);
  });
  it('N:1 is the mirror image', () => {
    const out = tablesFor(rel({ min: 0, max: 'N' }, { min: 1, max: '1' }));
    expect(cols(out, 'authors').find((c) => c.kind === 'fk')).toMatchObject({ name: 'book_id', ref: 'books.id', nullable: false });
  });
  it('1:1 puts a unique FK on one side', () => {
    const out = tablesFor(rel({ min: 1, max: '1' }, { min: 0, max: '1' }));
    expect(cols(out, 'books').find((c) => c.kind === 'fk')).toMatchObject({ name: 'author_id', unique: true, nullable: false });
    const flipped = tablesFor(rel({ min: 1, max: '1' }, { min: 0, max: '1' }, 'a'));
    expect(cols(flipped, 'authors').find((c) => c.kind === 'fk')).toMatchObject({ name: 'book_id', unique: true, nullable: true });
    expect(flipped.issues).toEqual([]);
  });
  it('M:N generates a join table with a composite key and the relationship\'s own attributes', () => {
    const out = tablesFor(rel({ min: 0, max: 'N' }, { min: 0, max: 'N' }, 'auto', { joinTable: 'authorships', attrs: ['royalty_pct'] }));
    const join = out.tables.find((t) => t.join)!;
    expect(join.name).toBe('authorships');
    expect(join.columns.filter((c) => c.partOfKey).map((c) => c.name)).toEqual(['author_id', 'book_id']);
    expect(join.columns.map((c) => c.name)).toContain('royalty_pct');
    expect(cols(out, 'authors').some((c) => c.kind === 'fk')).toBe(false);
    expect(cols(out, 'books').some((c) => c.kind === 'fk')).toBe(false);
  });
  it('every combination of min and max produces tables and only wrong-side placements produce issues', () => {
    const ends: Omit<End, 'entity'>[] = [{ min: 0, max: '1' }, { min: 1, max: '1' }, { min: 0, max: 'N' }, { min: 1, max: 'N' }];
    for (const a of ends) for (const b of ends) {
      const out = tablesFor(rel(a, b));
      expect(out.issues).toEqual([]);
      expect(out.tables.length).toBe(kindOf(rel(a, b)) === 'M:N' ? 3 : 2);
    }
  });
});

describe('the classic mistakes', () => {
  it('a FK on the one side of 1:N is a repeating group', () => {
    const out = tablesFor(rel({ min: 1, max: '1' }, { min: 0, max: 'N' }, 'a'));
    expect(out.issues).toHaveLength(1);
    expect(cols(out, 'authors')).toContainEqual(expect.objectContaining({ name: 'book_ids', kind: 'error' }));
  });
  it('M:N squeezed into one table is a list stuffed into a column', () => {
    for (const side of ['a', 'b'] as FkSide[]) {
      const out = tablesFor(rel({ min: 0, max: 'N' }, { min: 0, max: 'N' }, side));
      expect(out.issues).toHaveLength(1);
      expect(out.tables.some((t) => t.join)).toBe(false);
    }
  });
});

describe('self-relations', () => {
  it('an employee\'s manager is a nullable FK to the same table', () => {
    const org = PRESETS.find((p) => p.id === 'org')!;
    const out = generateTables(org.entities, org.rels);
    expect(cols(out, 'employees')).toContainEqual(expect.objectContaining({ name: 'manager_id', kind: 'fk', ref: 'employees.id', nullable: true }));
    expect(out.issues).toEqual([]);
  });
  it('putting it on the manager side names the roles, not "employees to employees"', () => {
    const org = PRESETS.find((p) => p.id === 'org')!;
    const rels = org.rels.map((r) => (r.id === 'manages' ? { ...r, fkSide: 'a' as const } : r));
    const out = generateTables(org.entities, rels);
    expect(cols(out, 'employees')).toContainEqual(expect.objectContaining({ name: 'report_ids', kind: 'error' }));
    expect(out.issues[0].text).toMatch(/one manager has many reports/);
  });
});

describe('presets', () => {
  it('generate cleanly, with the expected join tables', () => {
    const joins = PRESETS.map((p) => generateTables(p.entities, p.rels)).map((o) => {
      expect(o.issues).toEqual([]);
      return o.tables.filter((t) => t.join).map((t) => t.name);
    });
    expect(joins).toEqual([['order_items'], ['post_tags'], ['enrolments'], []]);
  });
  it('read out in plain words', () => {
    const shop = PRESETS[0];
    expect(describeRel(shop.rels[0], shop.entities)).toBe('Each user has zero or more orders; each order has exactly one user.');
  });
  it('use role names when both ends are the same entity', () => {
    const org = PRESETS.find((p) => p.id === 'org')!;
    expect(describeRel(org.rels[0], org.entities)).toBe('Each manager has zero or more reports; each report has zero or one manager.');
  });
});
