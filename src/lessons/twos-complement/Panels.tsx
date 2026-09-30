import type { ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { fromBitsSigned, type Bit } from '../../core/bits';
import type { Tone } from '../../core/tone';
import type { ByteSum, NegateSteps } from './model';

type BitTone = (i: number, bit: Bit) => Tone;
const bitsTone: BitTone = (_, bit) => (bit ? 'hi' : 'dim');

/** One labelled row of the column addition, with an optional slot for the carry out. */
function SumRow({ label, bits, lead, toneOf = bitsTone }: { label: ReactNode; bits: Bit[]; lead?: ReactNode; toneOf?: BitTone }) {
  return (
    <div className="tc-sum-row">
      <span className="tc-sum-label">{label}</span>
      <span className="tc-sum-lead">{lead}</span>
      <BitStrip bits={bits} toneOf={toneOf} ariaLabel={String(label)} />
    </div>
  );
}

/** Column-by-column addition of two bytes, with the two ways of reading the answer. */
export function AddPanel({ sum }: { sum: ByteSum }) {
  return (
    <div className="tc-add">
      <Box className="tc-columns">
        <SumRow label="carry in" bits={sum.carries} toneOf={(_, b) => (b ? 'info' : 'dim')} />
        <SumRow label={`A = ${fromBitsSigned(sum.a)}`} bits={sum.a} />
        <SumRow label={`B = ${fromBitsSigned(sum.b)}`} bits={sum.b} />
        <div className="tc-rule" />
        <SumRow
          label="A + B"
          bits={sum.sum}
          lead={<span className={`tc-carry-out ${sum.carryOut ? 'is-out' : ''}`} title="carry out of the top bit">{sum.carryOut}</span>}
        />
      </Box>
      <div className="tc-verdicts">
        <Verdict
          title="Read as unsigned (0…255)"
          wrong={sum.unsignedWraps}
          body={
            <>
              Should be <b>{sum.trueUnsigned}</b>, the byte holds <b>{sum.resultUnsigned}</b>.{' '}
              {sum.unsignedWraps ? 'A 1 carried out of the top bit and was lost: wraparound.' : 'Correct.'}
            </>
          }
        />
        <Verdict
          title="Read as signed (−128…127)"
          wrong={sum.signedOverflow}
          body={
            <>
              Should be <b>{sum.trueSigned}</b>, the byte holds <b>{sum.resultSigned}</b>.{' '}
              {sum.signedOverflow
                ? 'Both inputs had the same sign but the result\'s sign bit flipped: signed overflow.'
                : 'Correct, even if a carry fell off the top.'}
            </>
          }
        />
      </div>
    </div>
  );
}

function Verdict({ title, wrong, body }: { title: string; wrong: boolean; body: ReactNode }) {
  return (
    <Box className={`tc-verdict ${wrong ? 'tone-bad is-wrong' : 'tone-ok'}`}>
      <SectionTitle>{title}</SectionTitle>
      <p>
        <span className="tc-verdict-tag">{wrong ? 'wrong' : 'right'}</span> {body}
      </p>
    </Box>
  );
}

/** Negation step by step: the bits, every bit inverted, then +1. `shown` reveals rows as they play. */
export function NegatePanel({ steps, shown }: { steps: NegateSteps; shown: number }) {
  const x = fromBitsSigned(steps.original);
  return (
    <Box className="tc-negate">
      <SectionTitle hint="how the CPU computes −x">Negate {x}</SectionTitle>
      <SumRow label={`x = ${x}`} bits={steps.original} />
      {shown >= 1 && <SumRow label="invert all bits" bits={steps.inverted} />}
      {shown >= 2 && <SumRow label={`+1 = ${steps.resultValue}`} bits={steps.result} />}
    </Box>
  );
}
