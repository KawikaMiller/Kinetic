/**
 * Numbers the summary, try-this, key ideas and quiz quote. The protocol is asynchronous (Web Crypto), so they cannot be
 * computed when the module loads: they are typed here and `lesson.test.ts` asserts every one against the model run.
 */
export const FACTS = {
  chainMessages: 8,
  /** Keys tried per earlier message in the symmetric-only chain scene: 10 chain steps of each of the two stolen chains. */
  symmetricTries: 20,
  fixedOpens: 'all eight',
  healingDefault: 5,
  readableDefault: 'messages 2, 3 and 4',
  sealedDefault: 'messages 5 and 6',
  modeFixed: 'm1 m2 m3 m4 m5 m6',
  modeSymmetric: 'm3 m4 m5 m6',
  modeFull: 'm3 m4',
  patternSize: 6,
};
