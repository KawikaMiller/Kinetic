/**
 * Scene 3: level- versus edge-triggered epoll on one connection that receives one 300-byte message. The stall
 * is produced by running the handler loop, not scripted. Behaviour checked once against Linux (see lesson tests).
 */
import { parseBoundedInt, type FieldParse } from '../../core/parse';

export const MESSAGE_BYTES = 300;
/** The byte strip draws the message in cells of this many bytes. */
export const CELL_BYTES = 20;
export const CELLS = MESSAGE_BYTES / CELL_BYTES;

export type Trigger = 'level' | 'edge';

/** A typed read size: a whole number of bytes from 1 to the message size; a read of 0 is refused with the reason. */
export const parseReadSize = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 1,
    max: MESSAGE_BYTES,
    messages: {
      empty: `Type how many bytes each read asks for, from 1 to ${MESSAGE_BYTES}.`,
      invalid: (typed) => `"${typed}" isn't a whole number of bytes.`,
      tooSmall: (v) => (v === 0 ? 'A read of 0 is a no-op: pick 1 or more.' : 'A read asks for at least 1 byte.'),
      tooBig: () => `The message is ${MESSAGE_BYTES} bytes: ask for ${MESSAGE_BYTES} or fewer.`,
    },
  });

export interface EdgeInput {
  trigger: Trigger;
  /** Bytes the handler asks for in each read. */
  readBytes: number;
  /** Keep reading until the socket says EAGAIN (nothing left for now). */
  drain: boolean;
}

export type EdgeKind = 'arrive' | 'report' | 'read' | 'eagain' | 'block';

export interface EdgeEvent {
  kind: EdgeKind;
  /** Bytes the handler has taken so far, after this event. */
  readSoFar: number;
  say: string;
}

export interface EdgeRun {
  events: EdgeEvent[];
  reads: number;
  reports: number;
  readTotal: number;
  remaining: number;
  /** `hung`: bytes left in the socket and epoll will not say so again. `done`: nothing left. */
  verdict: 'done' | 'hung';
}

export const DEFAULT_EDGE: EdgeInput = { trigger: 'edge', readBytes: 100, drain: false };

export function runEdge({ trigger, readBytes, drain }: EdgeInput): EdgeRun {
  const events: EdgeEvent[] = [];
  let remaining = MESSAGE_BYTES;
  let reads = 0;
  let reports = 0;
  const readTotal = () => MESSAGE_BYTES - remaining;
  const add = (kind: EdgeKind, say: string) => events.push({ kind, readSoFar: readTotal(), say });

  add('arrive', `The client sends ${MESSAGE_BYTES} bytes: the socket becomes readable, a new edge.`);
  for (;;) {
    reports++;
    add('report', `epoll_wait returns fd 4 as readable${trigger === 'level' && reports > 1 ? `: ${remaining} bytes are still unread, so a level-triggered epoll reports it again` : ''}.`);
    const readOnce = () => {
      const got = Math.min(readBytes, remaining);
      remaining -= got;
      reads++;
      add('read', `read(4, buf, ${readBytes}) returns ${got}; ${remaining} ${remaining === 1 ? 'byte is' : 'bytes are'} still unread.`);
    };
    if (drain) {
      while (remaining > 0) readOnce();
      reads++;
      add('eagain', 'read returns EAGAIN: the socket is empty for now.');
    } else {
      readOnce();
    }
    if (trigger === 'level' && remaining > 0) continue;
    break;
  }
  const verdict = remaining > 0 ? 'hung' : 'done';
  add(
    'block',
    verdict === 'hung'
      ? `The handler goes back to epoll_wait with ${remaining} bytes unread. An edge-triggered epoll reports only a new arrival, so this connection is hung until more data comes.`
      : 'The handler goes back to epoll_wait with the socket empty: the connection is idle, and that is correct.',
  );
  return { events, reads, reports, readTotal: readTotal(), remaining, verdict };
}
