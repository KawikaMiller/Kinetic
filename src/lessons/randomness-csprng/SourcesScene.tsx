import { useState, type ReactNode } from 'react';
import { ClassifyBoard, type ClassifyItem } from '../../components/ClassifyBoard';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { classifyScore, emptyClassify, sortedCount } from '../../core/classify';
import { BINS, KEY, USES } from './sources';

const ITEMS: ClassifyItem[] = USES.map((u) => ({ id: u.id, label: u.label, text: u.label, explanation: u.reason }));

const intro = (sorted: number, checked: boolean, correct: number) =>
  checked ? <>{correct} of {ITEMS.length} sorted correctly. Press "Why?" on any use for the reason.</> : <>Sort each use into one of three bins, then press Check. {sorted} of {ITEMS.length} sorted so far.</>;

/** Scene 5: eight uses of randomness, and which source each one needs. */
export function SourcesScene({ picker }: { picker: ReactNode }) {
  const [board, setBoard] = useState(() => emptyClassify(ITEMS));
  const sorted = sortedCount(ITEMS, board.answers);
  const correct = classifyScore(ITEMS, KEY, board.answers);
  return (
    <StageFrame
      height={720}
      intro={intro(sorted, board.checked, correct)}
      introKey={`${sorted}|${board.checked}|${correct}`}
      stats={
        <Stats>
          <Stat label="Sorted" value={`${sorted} of ${ITEMS.length}`} color="var(--info)" sub="uses with a bin chosen" />
          <Stat label="Right" value={board.checked ? `${correct} of ${ITEMS.length}` : 'not checked'} color={board.checked ? (correct === ITEMS.length ? 'var(--ok)' : 'var(--hi)') : undefined} sub="after Check" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'sorted right', shape: 'square' }, { color: 'var(--bad)', label: 'sorted wrong', shape: 'square' }]} />}
      controls={[<>{picker}</>]}
    >
      <div className="rn-stage stage-pad">
        <ClassifyBoard items={ITEMS} categories={BINS} answerKey={KEY} value={board} onChange={setBoard} />
        <p className="rn-note">A nonce is a different matter. For AES-GCM the requirement is that a nonce is unique for each key, not that it is secret, so a counter works as well as random bytes, within the limits of the key and the counter.</p>
        <p className="rn-note">Sources people reach for: crypto.getRandomValues and crypto.randomUUID in browsers (a version 4 UUID carries 122 random bits), crypto.randomBytes in Node, and the operating system's generator underneath them. Math.random is not specified to be secure.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="from-memory">crypto.getRandomValues and randomUUID, Node's randomBytes, getrandom, /dev/urandom and BCryptGenRandom as operating-system sources, and V8's use of xorshift128+ for Math.random; check MDN, the Node documentation and each platform's manual</Provenance>
        <ClaimLabel kind="practice">a CSPRNG for secrets, a seeded generator for repeatable work, anything for the rest</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
