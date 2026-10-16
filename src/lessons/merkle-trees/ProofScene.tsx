import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { proofCaption } from './captions';
import { HashTree } from './HashTree';
import { auditPath, buildTree, flatten, pathIds, shortHash, utf8, verifyInclusion } from './merkle';
import { BLOCK_BYTES, HASH_BYTES, baseLeaves } from './sync';
import { PROOF_OPEN, sizeText, tamperedProof, type Tamper } from './view';

const TAMPERS: { value: Tamper; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'leaf', label: 'The leaf' },
  { value: 'sibling', label: 'A sibling hash' },
  { value: 'index', label: 'The claimed index' },
];
const PLOT_SIZES = Array.from({ length: 12 }, (_, i) => 2 ** (i + 1));

export function ProofScene({ picker }: { picker: ReactNode }) {
  const [selected, setSelected] = useState<number>(PROOF_OPEN.selected);
  const [tamper, setTamper] = useState<Tamper>('none');
  const [claimed, setClaimed] = useState<number>(PROOF_OPEN.selected);

  const n = PROOF_OPEN.n;
  const leaves = useMemo(() => baseLeaves(n), [n]);
  const tree = useMemo(() => buildTree('sha256', leaves)!, [leaves]);
  const index = tamper === 'index' ? claimed : selected;
  const proof = useMemo(() => auditPath('sha256', leaves, selected), [leaves, selected]);
  const sent = useMemo(() => tamperedProof(proof.map((p) => p.hash), tamper), [proof, tamper]);
  const data = utf8(tamper === 'leaf' ? `${leaves[selected]}!` : leaves[selected]);
  const v = useMemo(() => verifyInclusion('sha256', data, index, n, sent, tree.hash), [data, index, n, sent, tree.hash]);
  const nodes = useMemo(() => flatten(tree), [tree]);
  const leafNode = nodes.find((x) => x.left === null && x.lo === selected)!;
  const path = useMemo(() => new Set(pathIds(leafNode.id)), [leafNode]);
  const siblings = useMemo(() => new Set(pathIds(leafNode.id).slice(1).map((id) => id.slice(0, -1) + (id.endsWith('L') ? 'R' : 'L'))), [leafNode]);
  const caption = proofCaption(v, index, n);
  const proofBytes = sent.length * HASH_BYTES;

  return (
    <StageFrame
      height={600}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Proof" value={`${proof.length} hashes`} sub={`${sizeText(proof.length * HASH_BYTES)} for one of ${n} leaves`} />
          <Stat label="Verdict" value={v.ok ? 'verified' : 'refused'} color={v.ok ? 'var(--ok)' : 'var(--bad)'} sub={v.ok ? 'recomputed root equals the trusted root' : v.reason} />
          <Stat label="The whole data" value={sizeText(n * BLOCK_BYTES)} sub={`${n} blocks of ${sizeText(BLOCK_BYTES)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the path of hashes the verifier recomputes', shape: 'square' },
            { color: 'var(--violet)', label: 'the proof: the sibling hashes along the path', shape: 'square' },
            { color: 'var(--ok)', label: 'a verified leaf', shape: 'square' },
            { color: 'var(--bad)', label: 'a leaf that fails verification', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tamper with" value={tamper} onChange={setTamper} options={TAMPERS} />
          {tamper === 'index' && <Slider label="Claimed index" value={claimed} min={0} max={n - 1} onChange={setClaimed} />}
        </>,
      ]}
    >
      <div className="mkl-stage stage-pad">
        <Box>
          <SectionTitle hint="click a leaf to ask for its proof">The tree and the proof</SectionTitle>
          <HashTree
            tree={tree}
            mark={(x) => (x.id === leafNode.id ? { tone: v.ok ? 'ok' : 'bad', fill: 'solid' } : siblings.has(x.id) ? { tone: 'violet', fill: 'tint' } : path.has(x.id) ? { tone: 'hi', fill: 'tint' } : null)}
            edge={(p, c) => path.has(p.id) && path.has(c.id)}
            onLeaf={(i) => { setSelected(i); setClaimed(i); }}
            ariaLabel={`Merkle tree of ${n} leaves with the proof for leaf ${selected}`}
          />
        </Box>
        <Box>
          <SectionTitle hint="the verifier holds the leaf, the proof and the trusted root, and nothing else">Recomputing the root</SectionTitle>
          <table className="mkl-table table-cards">
            <thead><tr><th scope="col">Step</th><th scope="col">Sibling hash</th><th scope="col">Sits on</th><th scope="col">Running hash</th></tr></thead>
            <tbody>
              <tr><td data-label="Step">leaf {index}</td><td data-label="Sibling hash">none</td><td data-label="Sits on">none</td><td data-label="Running hash">{shortHash(v.leaf)}</td></tr>
              {v.steps.map((s, i) => (
                <tr key={i}><td data-label="Step">{i + 1}</td><td data-label="Sibling hash" className="mkl-violet">{shortHash(s.sibling)}</td><td data-label="Sits on">{s.side}</td><td data-label="Running hash">{shortHash(s.hash)}</td></tr>
              ))}
              <tr><td data-label="Step">trusted root</td><td data-label="Sibling hash">none</td><td data-label="Sits on">none</td><td data-label="Running hash" className={v.ok ? 'mkl-ok' : 'mkl-bad'}>{shortHash(tree.hash)}</td></tr>
            </tbody>
          </table>
          <Hint tone="muted" block>{v.ok ? `The recomputed root ${shortHash(v.computedRoot!)} equals the trusted root.` : `${v.reason}.`} The verifier works out which side each sibling is on from the index and the size, never from the prover.</Hint>
        </Box>
        <Box>
          <SectionTitle hint="the proof grows by one hash each time the data doubles">Proof size against data size</SectionTitle>
          <Plot2D x={{ domain: [2, 4096], log: true, label: 'blocks n', tickValues: [2, 8, 32, 128, 512, 2048] }} y={{ domain: [32, 4096 * BLOCK_BYTES], log: true, label: 'bytes' }} ariaLabel="Proof bytes and data bytes against the number of blocks">
            <Curve points={PLOT_SIZES.map((m) => [m, m * BLOCK_BYTES])} tone="bad" />
            <Curve points={PLOT_SIZES.map((m) => [m, Math.ceil(Math.log2(m)) * HASH_BYTES])} tone="violet" />
            <VLine at={n} label={`n = ${n}`} tone="info" />
          </Plot2D>
          <Hint tone="muted" block>For {n} blocks the proof is {sizeText(proofBytes)} against {sizeText(n * BLOCK_BYTES)} of data; at 4,096 blocks it is {sizeText(Math.ceil(Math.log2(4096)) * HASH_BYTES)} against {sizeText(4096 * BLOCK_BYTES)}.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">SHA-256 inclusion proofs checked by the verification loop of the Certificate Transparency audit path; a block is 1 KiB, an illustrative size</Provenance>
          <Provenance kind="illustrative">integrity, not secrecy: a proof shows a block is in a tree whose root you trust, nothing about who made the root</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
