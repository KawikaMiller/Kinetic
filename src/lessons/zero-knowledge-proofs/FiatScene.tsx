import { useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { DEFAULT_R, DEFAULT_X, GROUPS, challengeText, editsThatPass, proveFiatShamir, verifyFiatShamir, type Group } from './schnorr';

const GROUP_OPTIONS = [
  { value: 'A' as const, label: 'Group A (5 bits)' },
  { value: 'B' as const, label: 'Group B (11 bits)' },
];

/** Scene 4: the challenge from a hash, so the proof is one message; edit the commitment and the check fails; SNARKs are named, not run. */
export function FiatScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<Group['id']>('A');
  const G = GROUPS[id];
  const [x, setX] = useState(DEFAULT_X);
  const [r, setR] = useState(DEFAULT_R);
  const [xText, setXText] = useState(String(DEFAULT_X));
  const [rText, setRText] = useState(String(DEFAULT_R));
  const [edit, setEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proof = proveFiatShamir(G, x, r);
  const typed = edit !== null && /^\d+$/.test(edit) ? BigInt(edit) : null;
  const tooBig = typed !== null && typed >= G.p;
  const shownT = typed !== null && !tooBig ? typed : proof.t;
  const check = verifyFiatShamir(G, proof.y, shownT, proof.s);
  const edited = shownT !== proof.t;
  const slip = editsThatPass(G, x, r);

  const read = (text: string, label: string, max: bigint, min: bigint) => parseBoundedInt(text, { min: Number(min), max: Number(max), messages: { tooBig: () => `Keep ${label} between ${min} and ${max}.`, tooSmall: () => `Keep ${label} between ${min} and ${max}.` } });
  const typeX = (text: string) => {
    setXText(text);
    const p = read(text, 'x', G.q - 1n, 1n);
    if (!p.ok) return setError(p.error);
    setError(null);
    setX(BigInt(p.value));
    setEdit(null);
  };
  const typeR = (text: string) => {
    setRText(text);
    const p = read(text, 'r', G.q - 1n, 0n);
    if (!p.ok) return setError(p.error);
    setError(null);
    setR(BigInt(p.value));
    setEdit(null);
  };
  const switchGroup = (next: Group['id']) => {
    const H = GROUPS[next];
    const nx = x < H.q ? x : 1n + (x % (H.q - 1n));
    const nr = r % H.q;
    setId(next);
    setX(nx);
    setR(nr);
    setXText(String(nx));
    setRText(String(nr));
    setEdit(null);
    setError(null);
  };

  const lines = [
    `hash input: ${challengeText(G, proof.y, shownT)}`,
    `challenge: c = SHA-256(input) mod ${G.q} = ${check.c}`,
    `answer: s = ${proof.s} (computed once, from the original t)`,
    `left side: g^s = ${G.g}^${proof.s} mod ${G.p} = ${check.lhs}`,
    `right side: t y^c = ${shownT} x ${proof.y}^${check.c} mod ${G.p} = ${check.rhs}`,
    check.ok ? 'both sides equal: accept' : 'the sides differ: reject',
  ];

  return (
    <StageFrame
      height={600}
      intro={
        edited
          ? check.ok
            ? `The edited t = ${shownT} still passed: in this group ${slip.passing} of the ${slip.tried} other values of t (1 to ${G.p - 1n}) slip through, because only ${String(G.q)} challenges exist and only elements of the subgroup can satisfy the equation. That is the toy, not the method.`
            : `Changing t after the fact changed the recomputed challenge to ${check.c}, and the check fails: the proof was bound to the t it was made with.`
          : `One message (t = ${proof.t}, s = ${proof.s}): anyone recomputes c = ${check.c} from the statement and t and checks the equation, with no interaction.`
      }
      introKey={`fs|${id}|${x}|${r}|${edit}`}
      stats={
        <Stats>
          <Stat label="Proof" value={`(${shownT}, ${proof.s})`} color={edited ? 'var(--bad)' : 'var(--info)'} sub="t and s, sent as one message" />
          <Stat label="Challenge c" value={String(check.c)} color="var(--hi)" sub="from SHA-256, not from a verifier" />
          <Stat label="Verifier" value={check.ok ? 'accepts' : 'rejects'} color={check.ok ? 'var(--ok)' : 'var(--bad)'} sub={`${G.bits}-bit group, a toy`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'the committed t', shape: 'square' }, { color: 'var(--hi)', label: 'the hashed challenge', shape: 'square' }, { color: 'var(--ok)', label: 'accepted', shape: 'square' }, { color: 'var(--bad)', label: 'an edited proof, rejected', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented<Group['id']> label="Group" options={GROUP_OPTIONS} value={id} onChange={switchGroup} />
        </>,
        <>
          <TextField label={`secret x (1 to ${G.q - 1n})`} value={xText} onChange={typeX} onBlur={() => { setXText(String(x)); setError(null); }} width={90} spellCheck={false} />
          <TextField label={`r (0 to ${G.q - 1n})`} value={rText} onChange={typeR} onBlur={() => { setRText(String(r)); setError(null); }} width={90} spellCheck={false} />
          {error && <Hint tone="bad">{error}</Hint>}
        </>,
        <>
          <TextField label="Edit t after the fact" value={edit ?? String(proof.t)} onChange={(v) => setEdit(v === String(proof.t) ? null : v.replace(/\D/g, '').slice(0, 5))} width={100} spellCheck={false} />
          <Button onClick={() => setEdit(null)}>Restore t</Button>
          {tooBig && <Hint tone="bad">t is a number mod {String(G.p)}: keep it below {String(G.p)}. Showing the original t.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad zk-stage">
        <ConsolePanel title="the verifier, alone" lines={lines} />
        <div className="zk-cheat">
          <b>Where SNARKs fit.</b> zk-SNARKs and zk-STARKs are proof systems for arbitrary statements, with proofs that are meant to be short and quick to verify (from memory, see the chip below). Nothing here runs one or demonstrates one. The Fiat-Shamir step above is the idea they build on, and a hash that leaves out the statement is a known way to get it wrong (named, not shown).
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">{G.bits}-bit group: a toy; the SHA-256 is real but the group around it proves nothing. Never copy this code</Provenance>
        <Provenance kind="not-run">zk-SNARKs and zk-STARKs are named and not run: nothing on this page is one</Provenance>
        <Provenance kind="from-memory">zk-SNARKs and zk-STARKs have short, fast-to-verify proofs: a general claim from memory; verify against a current survey or the original papers</Provenance>
        <Provenance kind="from-memory">the Fiat-Shamir heuristic dates from 1986 and turns an interactive proof into one message (verify the citation)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
