/**
 * exactly-once-myth, scene 4: the scopes in which "exactly-once" can honestly be said. A claim about practice, written from memory;
 * the lesson's runs are scenes 1 to 3.
 */
export interface Scope {
  id: string;
  title: string;
  commits: string;
  /** Is exactly-once honestly true at this scope? */
  honest: boolean;
  why: string;
}

export const SCOPES: readonly Scope[] = [
  {
    id: 'inside',
    title: 'Processing inside one system',
    commits: 'the effect and the input offset, in one atomic commit',
    honest: true,
    why: 'The input position and the output are saved in the same atomic step, so a crash and a retry either redo both or neither: the effect happens once even though the input may be read again. This is what stream engines advertise for their own transactions.',
  },
  {
    id: 'link',
    title: 'Delivery over a lossy link',
    commits: 'nothing: the two ends only exchange messages',
    honest: false,
    why: 'Neither end can know whether its last message arrived, which is Two Generals. A sender chooses between possibly losing the message and possibly sending it twice.',
  },
  {
    id: 'external',
    title: 'An effect on an external system',
    commits: 'nothing shared: the other system has its own state',
    honest: false,
    why: 'A crash can fall between the external call and the record that it happened. The way out is the external system recognising a repeat: an idempotency key, or dedup recorded in the same transaction as the effect.',
  },
];
