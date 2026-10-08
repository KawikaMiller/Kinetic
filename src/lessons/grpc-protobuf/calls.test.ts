import { describe, expect, it } from 'vitest';
import { decode, encode, SCHEMA } from './model';
import {
  DEADLINE_MS, ENDINGS, GRPC_PREFIX, MODES, REQUESTS, RESPONSES, STATUS_NAME, buildCall, counts, grpcFrame, messageLabel, messageNote, statusAt, streamState, type Mode,
} from './calls';

const kinds = (mode: Mode, ending: 'ok' | 'not-found' | 'deadline') => buildCall(mode, ending).map((m) => `${m.from[0]}:${m.kind}${m.n ?? ''}${m.endStream ? '!' : ''}`);

describe('the four call shapes, OK ending (hand-written sequences)', () => {
  it('unary: one request message, one response message', () => {
    expect(kinds('unary', 'ok')).toEqual(['c:req-headers', 'c:req-data1!', 's:resp-headers', 's:resp-data1', 's:trailers!']);
  });
  it('server streaming: one request, three responses', () => {
    expect(kinds('server', 'ok')).toEqual(['c:req-headers', 'c:req-data1!', 's:resp-headers', 's:resp-data1', 's:resp-data2', 's:resp-data3', 's:trailers!']);
  });
  it('client streaming: three requests (the last half-closes), one response', () => {
    expect(kinds('client', 'ok')).toEqual(['c:req-headers', 'c:req-data1', 'c:req-data2', 'c:req-data3!', 's:resp-headers', 's:resp-data1', 's:trailers!']);
  });
  it('bidirectional: the two directions interleave on the one stream', () => {
    expect(kinds('bidi', 'ok')).toEqual([
      'c:req-headers', 'c:req-data1', 's:resp-headers', 's:resp-data1', 'c:req-data2', 's:resp-data2', 'c:req-data3!', 's:resp-data3', 's:trailers!',
    ]);
  });
});

describe('every mode and ending', () => {
  it('has exactly one END_STREAM per side, and the stream ends on the last message', () => {
    for (const mode of MODES) {
      for (const ending of ENDINGS) {
        const ms = buildCall(mode, ending);
        expect(ms[0].kind).toBe('req-headers');
        expect(ms.at(-1)!.endStream || ms.at(-1)!.kind === 'cancel').toBe(true);
        const clientEnds = ms.filter((m) => m.from === 'client' && m.endStream).length;
        const serverEnds = ms.filter((m) => m.from === 'server' && m.endStream).length;
        if (ending === 'ok') expect([clientEnds, serverEnds]).toEqual([1, 1]);
        else if (ending === 'deadline') expect(serverEnds).toBe(0);
        else expect(serverEnds).toBe(1);
        expect(new Set(ms.map((m) => m.id)).size).toBe(ms.length);
      }
    }
  });

  it('the OK ending ends in grpc-status 0 and carries every message the mode sends', () => {
    for (const mode of MODES) {
      const ms = buildCall(mode, 'ok');
      const n = counts(mode);
      expect(ms.filter((m) => m.kind === 'req-data')).toHaveLength(n.requests);
      expect(ms.filter((m) => m.kind === 'resp-data')).toHaveLength(n.responses);
      expect(ms.at(-1)).toMatchObject({ kind: 'trailers', status: 0, tone: 'ok' });
    }
  });

  it('NOT_FOUND is a trailers-only response with HTTP status 200 and grpc-status 5, in place of the first response', () => {
    for (const mode of MODES) {
      const ms = buildCall(mode, 'not-found');
      const last = ms.at(-1)!;
      expect(last).toMatchObject({ kind: 'trailers-only', status: 5, from: 'server', tone: 'bad' });
      expect(messageLabel(last, mode)).toBe('HEADERS :status 200, grpc-status: 5');
      expect(ms.some((m) => m.kind === 'resp-data' || m.kind === 'resp-headers')).toBe(false);
    }
    expect(kinds('bidi', 'not-found')).toEqual(['c:req-headers', 'c:req-data1', 's:trailers-only!']);
    expect(kinds('client', 'not-found')).toEqual(['c:req-headers', 'c:req-data1', 'c:req-data2', 'c:req-data3!', 's:trailers-only!']);
  });

  it('a missed deadline ends with the client\'s RST_STREAM and DEADLINE_EXCEEDED (4), and the server never answers', () => {
    for (const mode of MODES) {
      const ms = buildCall(mode, 'deadline');
      expect(ms.at(-1)).toMatchObject({ kind: 'cancel', from: 'client', status: 4, tone: 'orange' });
      expect(ms.some((m) => m.from === 'server')).toBe(false);
      expect(messageNote(ms.at(-1)!)).toBe(`${DEADLINE_MS} ms passed with no answer`);
    }
    expect(STATUS_NAME[4]).toBe('DEADLINE_EXCEEDED');
    expect(STATUS_NAME[5]).toBe('NOT_FOUND');
  });
});

describe('message sizes come from the real encoder', () => {
  it('a DATA frame\'s payload is the protobuf encoding of its Order, and the length prefix is 5 bytes', () => {
    for (const mode of MODES) {
      for (const m of buildCall(mode, 'ok').filter((x) => x.kind === 'req-data' || x.kind === 'resp-data')) {
        const list = m.kind === 'req-data' ? REQUESTS : RESPONSES;
        expect(m.payload).toBe(encode(list[m.n! - 1]).bytes.length);
        expect(m.framed).toBe(GRPC_PREFIX + m.payload!);
      }
    }
  });

  it('the gRPC length prefix is a zero flag byte and a big-endian length (hand-worked: 0x00 then 00 00 00 11 for 17 bytes)', () => {
    const payload = Array.from({ length: 17 }, (_, i) => i);
    expect(grpcFrame(payload).slice(0, 5)).toEqual([0, 0, 0, 0, 17]);
    expect(grpcFrame(payload)).toHaveLength(22);
    expect(grpcFrame(Array(300).fill(1)).slice(0, 5)).toEqual([0, 0, 0, 1, 44]);
  });

  it('every sample message decodes back to itself', () => {
    for (const o of [...REQUESTS, ...RESPONSES]) {
      const d = decode(encode(o).bytes, { numbers: SCHEMA.numbers, deltaType: SCHEMA.deltaType });
      expect(d.ok && d.decoded.order).toEqual(o);
    }
  });

  it('labels name the frame type and the method', () => {
    expect(messageLabel(buildCall('server', 'ok')[0], 'server')).toBe('HEADERS POST /shop.Orders/WatchOrders');
    expect(messageNote(buildCall('unary', 'ok')[1])).toMatch(/^5 B prefix \+ \d+ B protobuf · END_STREAM$/);
  });
});

describe('stream state and statuses follow the messages shown', () => {
  it('walks idle → open → half-closed (client) → closed for a unary call', () => {
    const ms = buildCall('unary', 'ok');
    expect([-1, 0, 1, 2, 3, 4].map((i) => streamState(ms, i))).toEqual(['idle', 'open', 'half-closed (client)', 'half-closed (client)', 'half-closed (client)', 'closed']);
  });
  it('bidirectional stays open until the client\'s last message, and the HTTP status is 200 from the first response headers on', () => {
    const ms = buildCall('bidi', 'ok');
    const at = (kind: string, n?: number) => ms.findIndex((m) => m.kind === kind && m.n === n);
    expect(streamState(ms, at('req-data', 2))).toBe('open');
    expect(streamState(ms, at('req-data', 3))).toBe('half-closed (client)');
    expect(statusAt(ms, at('req-data', 1)).http).toBeNull();
    expect(statusAt(ms, at('resp-headers'))).toEqual({ http: 200, grpc: null });
  });
  it('the grpc-status appears only with the trailers (server) or the cancel (client), and the HTTP status stays 200 on errors', () => {
    for (const mode of MODES) {
      expect(statusAt(buildCall(mode, 'ok'), 99)).toEqual({ http: 200, grpc: { code: 0, by: 'server' } });
      expect(statusAt(buildCall(mode, 'not-found'), 99)).toEqual({ http: 200, grpc: { code: 5, by: 'server' } });
      expect(statusAt(buildCall(mode, 'deadline'), 99)).toEqual({ http: null, grpc: { code: 4, by: 'client' } });
      expect(statusAt(buildCall(mode, 'ok'), 0).grpc).toBeNull();
    }
  });
  it('a missed deadline closes the stream with no HTTP status ever sent', () => {
    expect(streamState(buildCall('server', 'deadline'), 99)).toBe('closed');
  });
});
