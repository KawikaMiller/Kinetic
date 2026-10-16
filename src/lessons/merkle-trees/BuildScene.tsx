import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { buildCaption, changedNodes, plural, RULE_NAME } from './captions';
import { HashTree } from './HashTree';
import { buildTree, checkLeafText, flatten, rootHash, shortHash, type OddRule } from './merkle';
import { BUILD_OPEN, MAX_BUILD_LEAVES, MIN_LEAVES, buildLeaves, changeMark } from './view';

const RULES = [{ value: 'rfc' as OddRule, label: 'Split at the largest power of two' }, { value: 'duplicate' as OddRule, label: 'Duplicate the last node' }];
const DEMO_A = ['a', 'b', 'c'];
const DEMO_B = ['a', 'b', 'c', 'c'];

export function BuildScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<number>(BUILD_OPEN.n);
  const [rule, setRule] = useState<OddRule>(BUILD_OPEN.rule);
  const [texts, setTexts] = useState<string[]>(() => buildLeaves(MAX_BUILD_LEAVES));
  const [selected, setSelected] = useState<number>(BUILD_OPEN.selected);
  const [draft, setDraft] = useState<string | null>(null);

  const base = useMemo(() => buildLeaves(MAX_BUILD_LEAVES), []);
  const leaves = useMemo(() => texts.slice(0, n), [texts, n]);
  const sel = Math.min(selected, n - 1);
  const tree = useMemo(() => buildTree('sha256', leaves, rule)!, [leaves, rule]);
  const changed = useMemo(() => new Set(leaves.map((t, i) => (t !== base[i] ? i : -1)).filter((i) => i >= 0)), [leaves, base]);
  const typed = draft ?? texts[sel];
  const check = checkLeafText(typed);
  const caption = buildCaption(tree, n, rule, changed);
  const demo = useMemo(() => (['rfc', 'duplicate'] as OddRule[]).map((r) => ({ rule: r, a: rootHash('sha256', DEMO_A, r), b: rootHash('sha256', DEMO_B, r) })), []);

  const edit = (v: string) => {
    setDraft(v);
    if (checkLeafText(v).ok) setTexts(texts.map((t, i) => (i === sel ? v : t)));
  };
  const pick = (i: number) => {
    setSelected(i);
    setDraft(null);
  };

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Root" value={shortHash(tree.hash)} sub="first 4 of 64 hex characters" />
          <Stat label="Hashes changed" value={changedNodes(tree, changed)} color={changed.size > 0 ? 'var(--bad)' : undefined} sub={`of ${flatten(tree).length} hashes in the tree`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a hash that matches the original', shape: 'square' },
            { color: 'var(--bad)', label: 'an edited leaf and the path of hashes above it', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Leaves" value={n} min={MIN_LEAVES} max={MAX_BUILD_LEAVES} onChange={setN} />
          <Segmented label="Odd leaf count" value={rule} onChange={setRule} options={RULES} />
        </>,
        <>
          <TextField label={`Leaf ${sel} text (click a leaf to choose)`} value={typed} onChange={edit} width={240} spellCheck={false} />
          <Button onClick={() => { setTexts(base); setDraft(null); }}>Reset edits</Button>
          {!check.ok && <Hint tone="muted">{check.error}</Hint>}
        </>,
      ]}
    >
      <div className="mkl-stage stage-pad">
        <Box>
          <SectionTitle hint="a leaf is H(0x00, data), a parent is H(0x01, left, right), the form Certificate Transparency uses">The tree</SectionTitle>
          <HashTree tree={tree} mark={(x) => (x.id === leafId(tree, sel) ? { tone: changed.has(sel) ? 'bad' : 'hi', fill: 'solid' } : changeMark(x, changed))} onLeaf={pick} ariaLabel={`Merkle tree of ${n} leaves`} />
        </Box>
        <Box>
          <SectionTitle hint={`${RULE_NAME[rule]} is the rule on screen`}>Does the leaf count matter?</SectionTitle>
          <table className="mkl-table table-cards">
            <thead><tr><th scope="col">Rule</th><th scope="col">Root of [a, b, c]</th><th scope="col">Root of [a, b, c, c]</th><th scope="col">Same root?</th></tr></thead>
            <tbody>
              {demo.map((d) => (
                <tr key={d.rule}>
                  <td data-label="Rule">{d.rule === 'rfc' ? 'RFC 6962 split' : 'Duplicate the last node'}</td>
                  <td data-label="Root of [a, b, c]">{shortHash(d.a)}</td>
                  <td data-label="Root of [a, b, c, c]">{shortHash(d.b)}</td>
                  <td data-label="Same root?" className={d.a === d.b ? 'mkl-bad' : 'mkl-ok'}>{d.a === d.b ? 'yes: a fourth copy of c goes unnoticed' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>With duplication, three leaves and four leaves ending in the same block share one root, so a verifier must also be told the leaf count. {plural(leaves.length, 'leaf', 'leaves')} are drawn above.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="real">SHA-256 as specified in FIPS 180-4, written out in the lesson and checked in its tests against node:crypto and crypto.subtle; shown as 4 of 64 hex characters, the full hash is what is compared</Provenance>
          <Provenance kind="from-memory">the leaf and node prefixes and the split rule are those of RFC 6962 section 2.1, matching the Certificate Transparency test vectors the tests recompute; the duplicate-last rule is a Bitcoin-style rule recalled from memory, check before relying on it</Provenance>
          <Provenance kind="illustrative">integrity, not secrecy, and not a security recommendation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

const leafId = (tree: ReturnType<typeof buildTree> & object, index: number) => flatten(tree).find((x) => x.left === null && x.lo === index && !x.copy)?.id ?? '';
