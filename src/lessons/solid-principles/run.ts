import { L_CODE, type Design } from './code';
import { renderListing } from './model';

/** One call made against the L scene's code: which subclass goes in, through which function. */
export interface SubstitutionCall {
  /** The function written for the base type. */
  fn: string;
  /** The base type its parameter is documented as. */
  base: string;
  /** The subclass actually passed in. */
  subclass: string;
  /** The JavaScript expression, exactly as run and as printed. */
  code: string;
}

export const L_CALLS: Record<Design, SubstitutionCall[]> = {
  violating: [
    { fn: 'saveAll', base: 'File', subclass: 'File', code: "saveAll([new File('report.txt')], 'Q3 totals')" },
    { fn: 'saveAll', base: 'File', subclass: 'ReadOnlyFile', code: "saveAll([new ReadOnlyFile('archive.txt')], 'Q3 totals')" },
  ],
  fixed: [
    { fn: 'readAll', base: 'File', subclass: 'WritableFile', code: "readAll([new WritableFile('report.txt')])" },
    { fn: 'readAll', base: 'File', subclass: 'ReadOnlyFile', code: "readAll([new ReadOnlyFile('archive.txt')])" },
    { fn: 'saveAll', base: 'WritableFile', subclass: 'WritableFile', code: "saveAll([new WritableFile('report.txt')], 'Q3 totals')" },
  ],
};

export type RunResult =
  | { call: SubstitutionCall; ok: true; value: string[] }
  | { call: SubstitutionCall; ok: false; errorName: string; message: string; isTypeError: boolean };

/** The L scene's program text: the listing exactly as the code panel shows it. */
export const programText = (design: Design) => renderListing(L_CODE[design]).map((l) => l.text).join('\n');

/**
 * Runs one call against the L code for real. Safe: `new Function` only ever receives the
 * fixed, lesson-authored program above plus one of the fixed calls in L_CALLS; nothing the
 * learner types reaches it. (A strict CSP without 'unsafe-eval' would block it.)
 */
export function runCall(design: Design, call: SubstitutionCall): RunResult {
  try {
    const value = new Function(`${programText(design)}\nreturn (${call.code});`)() as string[];
    return { call, ok: true, value };
  } catch (e) {
    const err = e as Error;
    return { call, ok: false, errorName: err.name, message: err.message, isTypeError: e instanceof TypeError };
  }
}

export const runAll = (design: Design) => L_CALLS[design].map((c) => runCall(design, c));
