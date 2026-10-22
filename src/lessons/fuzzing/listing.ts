/**
 * The target's source as the learner reads it, one line per branch tag. It is the lesson's own listing of what
 * `runTarget` does (the tests check every tag b1..b11 appears exactly once and that each branch's line is
 * the one the graph and the coverage map point at), shown in a CodePanel with covered branches lit.
 * Lines stay short so the panel does not wrap on a phone.
 */
import { BRANCH, type BranchId, type TargetOptions } from './target';

export interface ListingLine {
  text: string;
  /** The branch this line is the tag of (a line can be code only). */
  branch?: BranchId;
}

const code = (text: string): ListingLine => ({ text });
const tag = (text: string, branch: BranchId): ListingLine => ({ text, branch });

const MAGIC_BYTEWISE: ListingLine[] = [
  code('  // magic: 75 78 84 67 is K N T C'),
  code('  if (bytes[0] !== 75) return reject();'),
  tag('  /* b1 */ if (bytes[1] !== 78) return reject();', BRANCH.magic0),
  tag('  /* b2 */ if (bytes[2] !== 84) return reject();', BRANCH.magic1),
  tag('  /* b3 */ if (bytes[3] !== 67) return reject();', BRANCH.magic2),
  tag('  /* b4 */ if (bytes.length < 5) return reject();', BRANCH.magicOk),
];

const MAGIC_SINGLE: ListingLine[] = [
  code('  // magic: 75 78 84 67, compared as one'),
  tag('  /* b4 */ if (!sameFour(bytes)) return reject();', BRANCH.magicOk),
  code('  if (bytes.length < 5) return reject();'),
];

export function listing(magic: TargetOptions['magic']): ListingLine[] {
  return [
    code('function parseRecord(bytes) {'),
    code('  // read(i) throws past the end of bytes'),
    tag('  const reject = () => "rejected";    // b11', BRANCH.reject),
    ...(magic === 'bytewise' ? MAGIC_BYTEWISE : MAGIC_SINGLE),
    tag('  /* b5 */ const length = bytes[4];', BRANCH.lengthRead),
    code('  let sum = 0;'),
    code('  for (let i = 0; i < length; i++) {'),
    tag('    sum = (sum + read(5 + i)) & 255;  // b6', BRANCH.payloadByte),
    code('  }'),
    tag('  /* b7 */ const at = 5 + length;', BRANCH.payloadDone),
    tag('  const stored = read(at);            // b8', BRANCH.checksumRead),
    tag('  if (stored === sum) return "ok";    // b9', BRANCH.checksumOk),
    tag('  return "rejected";                  // b10', BRANCH.checksumBad),
    code('}'),
  ];
}

/** The branch tags that appear in a listing's text, in order (`b4`, `b11`...). */
export const tagsIn = (lines: readonly ListingLine[]): number[] =>
  lines.flatMap((l) => [...l.text.matchAll(/\bb(\d+)\b/g)].map((m) => Number(m[1])));
