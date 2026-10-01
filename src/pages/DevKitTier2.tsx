import { useMemo, useState } from 'react';
import { ByteGrid } from '../components/ByteGrid';
import { CellGrid } from '../components/CellGrid';
import { SectionTitle } from '../components/Panel';
import { TreeSvg } from '../components/TreeSvg';
import { Button } from '../components/ui';
import { createDisjointSet } from '../core/disjointSet';
import { sieve } from '../core/numberTheory';
import { mulberry32 } from '../core/random';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demos of the Tier 2 shared kit, rendered at the bottom of DevKit (#/dev/kit). */
export function DevKitTier2() {
  return (
    <>
      <SectionTitle>Tier 2 kit</SectionTitle>
      <Section title="CellGrid · Sieve of Eratosthenes to 100 (click a cell; arrows move)">
        <SieveDemo />
      </Section>
      <Section title="CellGrid · canvas mode: 1,000 people, 10 test positive">
        <CrowdDemo />
      </Section>
      <Section title="ByteGrid · an Ethernet header with fields and ASCII">
        <BytesDemo />
      </Section>
      <Section title="TreeSvg forest · union-find sets merging">
        <ForestDemo />
      </Section>
    </>
  );
}

function SieveDemo() {
  const { passes } = useMemo(() => sieve(100), []);
  const [pass, setPass] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const crossedBy = useMemo(() => {
    const m = new Map<number, number>();
    passes.slice(0, pass).forEach((p, k) => p.crossed.forEach((n) => m.set(n, k)));
    return m;
  }, [passes, pass]);
  const done = pass >= passes.length;
  return (
    <div>
      <CellGrid
        rows={10}
        cols={10}
        size="md"
        ariaLabel="Numbers 1 to 100"
        cell={(r, c) => {
          const n = r * 10 + c + 1;
          if (n === 1 || crossedBy.has(n)) return { text: n, fill: 'none' };
          const k = passes.findIndex((p) => p.prime === n);
          if (k >= 0 && k === pass - 1) return { text: n, tone: 'hi', fill: 'solid' };
          return done || (k >= 0 && k < pass) ? { text: n, tone: 'ok', fill: 'tint' } : { text: n };
        }}
        cellAriaLabel={(r, c) => {
          const n = r * 10 + c + 1;
          return `${n}${crossedBy.has(n) ? ', crossed out' : ''}`;
        }}
        onCellClick={(r, c) => setPicked(r * 10 + c + 1)}
        highlight={picked ? [{ r: Math.floor((picked - 1) / 10), c: (picked - 1) % 10, tone: 'info' }] : []}
      />
      <p className="muted">
        <Button onClick={() => setPass((p) => Math.min(passes.length, p + 1))} disabled={done}>
          Next prime
        </Button>{' '}
        <Button onClick={() => setPass(0)}>Reset</Button> pass {pass}/{passes.length}
        {picked ? ` · picked ${picked}` : ''}
      </p>
    </div>
  );
}

function CrowdDemo() {
  const sick = useMemo(() => {
    const rnd = mulberry32(7);
    const s = new Set<number>();
    while (s.size < 10) s.add(Math.floor(rnd() * 1000));
    return s;
  }, []);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div>
      <CellGrid
        rows={25}
        cols={40}
        size="xs"
        ariaLabel="1,000 people"
        cell={(r, c) => (sick.has(r * 40 + c) ? { tone: 'bad', fill: 'solid' } : { tone: 'info', fill: 'tint', intensity: 0.25 })}
        cellAriaLabel={(r, c) => `person ${r * 40 + c + 1}${sick.has(r * 40 + c) ? ', has the condition' : ''}`}
        onCellClick={(r, c) => setPicked(r * 40 + c + 1)}
      />
      <p className="muted">{picked ? `picked person ${picked}` : 'click or Tab in and use the arrow keys'}</p>
    </div>
  );
}

function BytesDemo() {
  // dst MAC, src MAC, EtherType 0x0800 (IPv4), then the start of an IPv4 header.
  const bytes = [
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x02, 0x42, 0xac, 0x11, 0x00, 0x02, 0x08, 0x00, 0x45, 0x00, 0x00, 0x3c, 0x1c, 0x46,
    0x40, 0x00, 0x40, 0x06, 0x48, 0x54, 0x54, 0x50,
  ];
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <ByteGrid
      bytes={bytes}
      ascii
      ariaLabel="Frame bytes"
      fields={[
        { from: 0, to: 5, tone: 'info', label: 'destination MAC' },
        { from: 6, to: 11, tone: 'violet', label: 'source MAC' },
        { from: 12, to: 13, tone: 'orange', label: 'EtherType (IPv4)' },
      ]}
      highlight={picked !== null ? [{ i: picked, tone: 'hi' }] : []}
      onByteClick={setPicked}
    />
  );
}

function ForestDemo() {
  const n = 8;
  const [steps, setSteps] = useState(0);
  const unions: [number, number][] = [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [0, 7]];
  const dsu = createDisjointSet(n, { compress: false });
  unions.slice(0, steps).forEach(([a, b]) => dsu.union(a, b));
  const parent = dsu.parents();
  const roots = parent.flatMap((p, i) => (p === i ? [i] : []));
  return (
    <div style={{ maxWidth: 420 }}>
      <TreeSvg
        shape={{ root: null, roots, children: (id: number) => parent.flatMap((p, i) => (p === id && i !== id ? [i] : [])) }}
        width={420}
        height={180}
        label={(id) => id}
        nodeMark={(id) => (parent[id] === id ? { tone: 'info', fill: 'tint' } : null)}
        ariaLabel="Union-find forest"
      />
      <p className="muted">
        <Button onClick={() => setSteps((s) => Math.min(unions.length, s + 1))} disabled={steps >= unions.length}>
          Next union
        </Button>{' '}
        <Button onClick={() => setSteps(0)}>Reset</Button> {dsu.count} sets
      </p>
    </div>
  );
}
