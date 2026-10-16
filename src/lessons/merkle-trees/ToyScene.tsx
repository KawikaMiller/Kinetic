import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { toyCaption, plural } from './captions';
import { HashTree } from './HashTree';
import { buildTree, type HashKind } from './merkle';
import { SYNC_SEEDS, directDiff, findDiffs, lowestMiss, runSync, seededReplicas } from './sync';
import { TOY_OPEN, collisionNodes, syncFrames, syncMark } from './view';

export function ToyScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(TOY_OPEN.seed);
  const [toy, setToy] = useState<boolean>(TOY_OPEN.toy);
  const kind: HashKind = toy ? 'toy8' : 'sha256';

  const { a, b, k } = useMemo(() => seededReplicas(seed), [seed]);
  const result = useMemo(() => runSync(kind, a, b), [kind, a, b]);
  const final = useMemo(() => syncFrames(kind, a, b, () => '').at(-1)!, [kind, a, b]);
  const tree = useMemo(() => buildTree(kind, a)!, [kind, a]);
  const collisions = useMemo(() => collisionNodes(kind, a, b), [kind, a, b]);
  const misses = useMemo(() => ({ toy8: SYNC_SEEDS.filter((s) => { const r = seededReplicas(s); return findDiffs('toy8', r.a, r.b).found.length !== directDiff(r.a, r.b).length; }).length, lowest: lowestMiss('toy8') }), []);
  const missCount = toy ? misses.toy8 : 0;
  const caption = toyCaption(toy, result.missed, result.truth, seed, missCount);

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Ranges that differ" value={result.truth.length} sub={`seed ${seed}`} />
          <Stat label="Found by the descent" value={result.found.length} color={result.missed.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`${result.comparisons} comparisons`} />
          <Stat label="Missed" value={result.missed.length} color={result.missed.length > 0 ? 'var(--bad)' : 'var(--ok)'} sub={result.missed.length > 0 ? `ranges ${result.missed.join(', ')}` : 'none'} />
          <Stat label="Seeds that miss, of 200" value={missCount} sub={toy ? `the lowest is seed ${misses.lowest}` : 'a 256-bit hash misses none'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a hash that matches its twin', shape: 'square' },
            { color: 'var(--bad)', label: 'a hash that differs', shape: 'square' },
            { color: 'var(--orange)', label: 'a toy collision: different subtrees, equal 8-bit hashes', shape: 'square' },
            { color: 'var(--dim)', label: 'a subtree skipped without descent', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Hash" value={toy} onChange={setToy} off="SHA-256 (256 bits)" on="Toy 8-bit hash" />
          <SeedField seed={seed} onSeed={setSeed} label="Seed (which ranges differ)" />
          <Button onClick={() => setSeed(misses.lowest ?? 0)}>Load seed {misses.lowest}</Button>
        </>,
      ]}
    >
      <div className="mkl-stage stage-pad">
        <Box>
          <SectionTitle hint={`${toy ? 'every hash is cut to its first byte: a toy' : 'full-width hashes'}; ${plural(k, 'range')} differ on B`}>A&apos;s tree after the descent</SectionTitle>
          <HashTree tree={tree} mark={(n) => syncMark(n.id, final, collisions)} edge={(p, c) => final.compared[p.id] === 'differ' && final.compared[c.id] !== undefined} ariaLabel="Replica A's tree after the anti-entropy descent" />
          <p className={`mkl-verdict ${result.missed.length > 0 ? 'is-bad' : 'is-ok'}`} role="status">
            {result.missed.length > 0 ? `The descent stopped at a node whose 8-bit hash matched, so range ${result.missed.join(', ')} was never compared: the replicas still differ.` : 'Every differing range was found and transferred.'}
          </p>
          <Hint tone="muted" block>With 8 bits two different subtrees collide one time in 256, so a comparison can say the same when it is not. Width is what makes a match mean equal; hashes being unique is not enough.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>the 8-bit hash is a toy that keeps the first byte of every SHA-256 hash, to show why width matters</Provenance>
          <Provenance kind="simulated" seed={seed}>replica contents and edits are seeded</Provenance>
          <Provenance kind="illustrative">not a security recommendation: this lesson is about integrity, not secrecy</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
