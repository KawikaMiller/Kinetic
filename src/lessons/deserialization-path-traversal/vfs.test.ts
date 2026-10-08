import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { runNode } from '../../core/testing/node';
import { pathFrames } from './frames';
import {
  ENTRIES, FILE_IDS, MAX_NAME, ROOT, SAMPLES, UPLOADS, childrenOf, entryAt, handle, isInside, isUnsafe, joinPath, normalize, parseName, walk,
  type HandlerMode,
} from './vfs';

/** 1,000 seeded benign relative paths built from a fixed alphabet of segments: names, ., .. and empty. */
const SEGMENTS = ['a', 'b', '.', '..', ''];
const rnd = mulberry32(2112);
const NAMES = [
  ...SAMPLES.map((s) => s.name),
  ...Array.from({ length: 1000 }, () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => SEGMENTS[Math.floor(rnd() * SEGMENTS.length)]).join('/')),
];

function realJoin(base: string, names: string[]): string[] {
  const code = [
    "const p = require('node:path').posix;",
    "const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));",
    'console.log(JSON.stringify(input.map(([b, n]) => p.join(b, n))));',
  ];
  const r = runNode(code, { input: JSON.stringify(names.map((n) => [base, n])), timeout: 30_000 });
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout) as string[];
}

describe('joinPath against real path.posix.join', () => {
  it(`agrees on the samples and on ${NAMES.length - SAMPLES.length} seeded paths, from the uploads folder`, () => {
    const real = realJoin(UPLOADS, NAMES);
    NAMES.forEach((n, i) => expect(joinPath(UPLOADS, n)).toBe(real[i]));
  });

  it('agrees from the root and from a deeper base too', () => {
    for (const base of [ROOT, `${UPLOADS}/2026`, '/']) {
      const real = realJoin(base, NAMES.slice(0, 300));
      NAMES.slice(0, 300).forEach((n, i) => expect(joinPath(base, n)).toBe(real[i]));
    }
  });

  it('hand-worked cases', () => {
    expect(joinPath(UPLOADS, 'invoice-42.pdf')).toBe('/srv/shop/uploads/invoice-42.pdf');
    expect(joinPath(UPLOADS, 'notes..txt')).toBe('/srv/shop/uploads/notes..txt');
    expect(joinPath(UPLOADS, 'reports/../../config/settings.yml')).toBe('/srv/shop/config/settings.yml');
    expect(joinPath(UPLOADS, '')).toBe(UPLOADS);
    expect(normalize('/..')).toBe('/');
    expect(normalize('/a/b/')).toBe('/a/b/');
  });
});

describe('the walk', () => {
  it('ends where joinPath ends (ignoring a trailing separator), for every name', () => {
    for (const n of NAMES) {
      const steps = walk(UPLOADS, n);
      const end = steps.at(-1)!.path;
      expect(end).toBe(joinPath(UPLOADS, n).replace(/(.)\/$/, '$1'));
    }
  });

  it('labels each piece: names go down, . and empty stay, .. climbs (or stays at the top)', () => {
    const kinds = walk(UPLOADS, 'a/./../b//..').map((s) => s.kind);
    expect(kinds).toEqual(['down', 'skip', 'up', 'down', 'skip', 'up']);
    expect(walk('/', '..')[0].kind).toBe('at-top');
  });
});

describe('the containment check', () => {
  it('accepts exactly the paths strictly under the uploads folder, including the uploads-old sibling', () => {
    const rootSegs = UPLOADS.split('/').filter(Boolean);
    for (const n of NAMES) {
      const p = joinPath(UPLOADS, n);
      const segs = p.split('/').filter(Boolean);
      const under = segs.length > rootSegs.length && rootSegs.every((s, i) => segs[i] === s);
      expect(isInside(UPLOADS, p)).toBe(under);
    }
  });

  it('the sibling folder passes a prefix check without the separator, and fails with it', () => {
    const sibling = `${ROOT}/uploads-old/legacy.txt`;
    expect(sibling.startsWith(UPLOADS)).toBe(true);
    expect(isInside(UPLOADS, sibling)).toBe(false);
  });

  it('removing a pattern once can leave a new one behind (found by search over a fixed alphabet, no string is given)', () => {
    const stripOnce = (s: string) => s.split('../').join('');
    const alphabet = ['.', '/', 'a'];
    let found = 0;
    const walkAll = (prefix: string) => {
      if (prefix.length > 8) return;
      if (prefix.includes('../') && stripOnce(prefix).includes('../')) found++;
      for (const c of alphabet) walkAll(prefix + c);
    };
    walkAll('');
    expect(found).toBeGreaterThan(0);
    // and one pass of the filter is not idempotent, which is the whole problem
    expect(stripOnce(stripOnce('a'))).toBe('a');
  });
});

describe('what each handler does with the samples', () => {
  const expected: Record<HandlerMode, Record<string, { status: string; escaped: boolean; unsafe: boolean }>> = {
    join: {
      'invoice-42.pdf': { status: 'served', escaped: false, unsafe: false },
      '2026/march.csv': { status: 'served', escaped: false, unsafe: false },
      'notes..txt': { status: 'not-found', escaped: false, unsafe: false },
      'reports/../../config/settings.yml': { status: 'served', escaped: true, unsafe: true },
    },
    check: {
      'invoice-42.pdf': { status: 'served', escaped: false, unsafe: false },
      '2026/march.csv': { status: 'served', escaped: false, unsafe: false },
      'notes..txt': { status: 'not-found', escaped: false, unsafe: false },
      'reports/../../config/settings.yml': { status: 'rejected', escaped: true, unsafe: false },
    },
    id: {
      'invoice-42.pdf': { status: 'not-found', escaped: false, unsafe: false },
      'notes..txt': { status: 'not-found', escaped: false, unsafe: false },
      'reports/../../config/settings.yml': { status: 'not-found', escaped: false, unsafe: false },
      'f-1': { status: 'served', escaped: false, unsafe: false },
      'f-2': { status: 'served', escaped: false, unsafe: false },
      'f-9': { status: 'not-found', escaped: false, unsafe: false },
    },
  };
  for (const [mode, table] of Object.entries(expected) as [HandlerMode, (typeof expected)['join']][]) {
    for (const [name, want] of Object.entries(table)) {
      it(`${mode} / ${name}`, () => {
        const o = handle(mode, name);
        expect({ status: o.status, escaped: o.escaped, unsafe: isUnsafe(o) }).toEqual(want);
      });
    }
  }

  it('an escaping name that matches no file is still unsafe with the plain join', () => {
    const o = handle('join', '../nothing-here.txt');
    expect(o.status).toBe('not-found');
    expect(isUnsafe(o)).toBe(true);
    expect(handle('check', '../nothing-here.txt').status).toBe('rejected');
  });

  it('by id, no name ever builds a path: the path is always a table row', () => {
    for (const n of NAMES) {
      const o = handle('id', n);
      expect(o.path === null || FILE_IDS.some((f) => f.path === o.path)).toBe(true);
      expect(o.escaped).toBe(false);
    }
  });

  it('with the check on, nothing the handler serves is ever outside uploads, for every seeded name', () => {
    for (const n of NAMES) {
      const o = handle('check', n);
      if (o.status === 'served') expect(isInside(UPLOADS, o.path!)).toBe(true);
      expect(isUnsafe(o)).toBe(false);
    }
  });
});

describe('the tree', () => {
  it('every entry hangs off the root and children are listed once', () => {
    for (const e of ENTRIES) if (e.path !== ROOT) expect(entryAt(e.path.slice(0, e.path.lastIndexOf('/')) || '/')).toBeDefined();
    expect(childrenOf(ROOT).sort()).toEqual([`${ROOT}/config`, `${ROOT}/keys`, UPLOADS, `${ROOT}/uploads-old`].sort());
  });
});

describe('the typed name', () => {
  it('accepts file names and relative paths', () => {
    for (const s of SAMPLES) expect(parseName(s.name)).toEqual({ ok: true, value: s.name });
    expect(parseName('/a').ok).toBe(true);
    expect(parseName('a'.repeat(MAX_NAME)).ok).toBe(true);
    expect(parseName('1e400').ok).toBe(true);
  });

  it('refuses the rest with a message and never coerces', () => {
    for (const bad of ['', ' ', ' a', 'a ', 'a b', 'a,b', '<b>', '😀', 'a'.repeat(MAX_NAME + 1), 'a\\b', 'a%2Fb', 'a\nb', 'a;b']) {
      const r = parseName(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });
});

describe('path frames', () => {
  const modes: HandlerMode[] = ['join', 'check', 'id'];
  it('end on the handler decision, with strict captions, for every sample, id and mode', () => {
    const names = [...SAMPLES.map((s) => s.name), ...FILE_IDS.map((f) => f.id), 'f-9', '../nothing-here.txt'];
    for (const mode of modes) {
      for (const name of names) {
        const frames = pathFrames(mode, name);
        const last = frames.at(-1)!;
        expect(last.outcome).toEqual(handle(mode, name));
        expect(frames.slice(0, -1).every((f) => f.outcome === null)).toBe(true);
        for (const f of frames) expectCaption(f.say);
        const text = expectCaption(last.say);
        const o = last.outcome!;
        if (o.status === 'rejected') expect(text).toContain('Rejected');
        if (isUnsafe(o)) expect(text).toContain('outside');
        if (mode !== 'id') expect(frames.length).toBe(name.split('/').length + 2);
      }
    }
  });

  it('climbs are recorded only for up steps between real folders', () => {
    const frames = pathFrames('join', 'reports/../../config/settings.yml');
    expect(frames.at(-1)!.climbs).toEqual([[UPLOADS, ROOT]]);
  });
});
