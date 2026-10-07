import { describe, expect, it } from 'vitest';
import { ROOMY_MIN_SCALE, SEQ, pickLayout, receivers, sequenceLayout, shownExtent, textWidth, wrapLabel, type SeqActor, type SeqMessage } from './sequenceLayout';
import { MIN_TEXT_PX } from './scale';

const DORA_ACTORS: SeqActor[] = [
  { id: 'laptop', label: 'Laptop' },
  { id: 'server', label: 'DHCP server' },
  { id: 'printer', label: 'Printer' },
];
const DORA: SeqMessage[] = [
  { id: 'd', from: 'laptop', to: '*', label: 'DHCPDISCOVER (broadcast)' },
  { id: 'o', from: 'server', to: 'laptop', label: 'DHCPOFFER 192.168.1.23' },
  { id: 'r', from: 'laptop', to: 'server', label: 'DHCPREQUEST', note: 'still broadcast' },
  { id: 'a', from: 'server', to: 'laptop', label: 'DHCPACK lease 24 h', lost: true },
  { id: 's', from: 'laptop', to: 'laptop', label: 'configure the interface' },
];

describe('wrapLabel', () => {
  it('keeps a fitting label on one line', () => {
    expect(wrapLabel('SYN', 100)).toEqual(['SYN']);
  });

  it('splits a long label into two balanced lines', () => {
    const lines = wrapLabel('GET /index.html with cookies attached', 120);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe('GET /index.html with cookies attached');
    expect(Math.abs(textWidth(lines[0]) - textWidth(lines[1]))).toBeLessThan(textWidth('cookies '));
  });

  it('never breaks inside a word', () => {
    expect(wrapLabel('Supercalifragilistic', 20)).toEqual(['Supercalifragilistic']);
  });
});

describe('sequenceLayout', () => {
  const L = sequenceLayout(DORA_ACTORS, DORA);

  it('places lanes left to right, evenly spaced, inside the width', () => {
    const xs = DORA_ACTORS.map((a) => L.lanes[a.id]);
    expect(xs[0]).toBeGreaterThanOrEqual(SEQ.HEAD_W / 2);
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 9);
    expect(xs[2]).toBeLessThanOrEqual(L.width - SEQ.HEAD_W / 2);
  });

  it('stacks rows top to bottom without overlap, inside the lifelines', () => {
    let prevBottom = L.head.h;
    for (const r of L.rows) {
      const top = r.labelY - SEQ.LINE_H;
      expect(top).toBeGreaterThanOrEqual(prevBottom);
      expect(r.y).toBeGreaterThan(r.labelY);
      prevBottom = Math.max(r.y + (r.kind === 'self' ? SEQ.SELF_DROP : 0), r.noteY ?? 0);
    }
    expect(L.lifelineEnd).toBeGreaterThanOrEqual(prevBottom);
    expect(L.height).toBeGreaterThan(L.lifelineEnd);
  });

  it('points arrows the right way and gives a broadcast a head on every other lifeline', () => {
    const [d, o, r, a, s] = L.rows;
    expect(d.kind).toBe('broadcast');
    expect(d.heads.map((h) => h.x).sort()).toEqual([L.lanes.server, L.lanes.printer].sort());
    expect(d.heads.every((h) => h.dir === 1)).toBe(true);
    expect(o.kind).toBe('left');
    expect(o.heads).toEqual([{ x: L.lanes.laptop, dir: -1 }]);
    expect(r.kind).toBe('right');
    expect(s.kind).toBe('self');
    expect(a.kind).toBe('left');
  });

  it('stops a lost message partway, with no arrowhead', () => {
    const a = L.rows[3];
    expect(a.heads).toEqual([]);
    expect(a.lostAt).toBeCloseTo(a.x1 + (a.x2 - a.x1) * SEQ.LOST_AT, 9);
    expect(a.lostAt!).toBeLessThan(a.x1);
    expect(a.lostAt!).toBeGreaterThan(a.x2);
  });

  it('puts a note under its arrow', () => {
    const r = L.rows[2];
    expect(r.noteY).toBeGreaterThan(r.y);
    expect(L.rows[0].noteY).toBeNull();
  });

  it('wraps labels to at most two lines that fit between their lanes', () => {
    for (const [i, r] of L.rows.entries()) {
      expect(r.lines.length).toBeLessThanOrEqual(2);
      if (r.kind === 'right' || r.kind === 'left') {
        for (const line of r.lines) expect(textWidth(line)).toBeLessThanOrEqual(Math.abs(r.x2 - r.x1) - SEQ.PAD * 2 + 1e-9);
      }
      expect(r.lines.join(' ')).toBe(DORA[i].label);
    }
  });

  it('spreads to a requested width but never squeezes below its natural width', () => {
    const wide = sequenceLayout(DORA_ACTORS, DORA, 1200);
    expect(wide.width).toBe(1200);
    expect(wide.lanes.printer).toBeGreaterThan(L.lanes.printer);
    expect(sequenceLayout(DORA_ACTORS, DORA, 100).width).toBe(L.width);
  });

  it('reports the narrowest container that keeps text at 8px or more', () => {
    expect(L.minWidth).toBe(Math.ceil((L.width * 8) / 12));
    expect((SEQ.FONT * L.minWidth) / L.width).toBeGreaterThanOrEqual(MIN_TEXT_PX);
  });

  it('a three-actor ladder with short labels fits a phone without scrolling', () => {
    const slaac = sequenceLayout(
      [
        { id: 'h', label: 'Host' },
        { id: 'r', label: 'Router' },
        { id: 'n', label: 'Neighbours' },
      ],
      [
        { id: '1', from: 'h', to: '*', label: 'Router Solicitation' },
        { id: '2', from: 'r', to: 'h', label: 'Router Advertisement' },
      ],
    );
    expect(slaac.minWidth).toBeLessThanOrEqual(358); // 390 minus the 16px gutters
  });

  it('refuses unknown actors', () => {
    expect(() => sequenceLayout(DORA_ACTORS, [{ id: 'x', from: 'laptop', to: 'nobody', label: 'hi' }])).toThrow(RangeError);
    expect(() => sequenceLayout([], [])).toThrow(RangeError);
  });
});

describe('partial broadcasts and fan-out', () => {
  const RELAY_ACTORS: SeqActor[] = [
    { id: 'laptop', label: 'Laptop' },
    { id: 'relay', label: 'Relay' },
    { id: 'server', label: 'Server' },
  ];

  it('resolves receivers: one id, a list, or everyone but the sender', () => {
    expect(receivers(RELAY_ACTORS, { id: 'a', from: 'laptop', to: 'relay', label: '' })).toEqual(['relay']);
    expect(receivers(RELAY_ACTORS, { id: 'a', from: 'laptop', to: ['relay', 'server'], label: '' })).toEqual(['relay', 'server']);
    expect(receivers(RELAY_ACTORS, { id: 'a', from: 'relay', to: '*', label: '' })).toEqual(['laptop', 'server']);
  });

  it('draws a broadcast only some lifelines hear: dotted, with heads only on those', () => {
    const L = sequenceLayout(RELAY_ACTORS, [{ id: 'd', from: 'laptop', to: ['relay'], broadcast: true, label: 'DHCPDISCOVER' }]);
    const [d] = L.rows;
    expect(d.kind).toBe('broadcast');
    expect(d.heads).toEqual([{ x: L.lanes.relay, dir: 1 }]);
    expect(d.x2).toBe(L.lanes.relay);
  });

  it('a list without broadcast is a plain fan-out with a head on each receiver', () => {
    const L = sequenceLayout(RELAY_ACTORS, [
      { id: 'f', from: 'relay', to: ['laptop', 'server'], label: 'reply' },
      { id: 'one', from: 'laptop', to: ['server'], label: 'just one' },
    ]);
    expect(L.rows[0].kind).toBe('fanout');
    expect(L.rows[0].heads.map((h) => h.dir).sort()).toEqual([-1, 1]);
    // a one-item list without broadcast is an ordinary arrow
    expect(L.rows[1].kind).toBe('right');
  });

  it('refuses an empty receiver list and unknown receivers in a list', () => {
    expect(() => sequenceLayout(RELAY_ACTORS, [{ id: 'x', from: 'laptop', to: [], label: '' }])).toThrow(RangeError);
    expect(() => sequenceLayout(RELAY_ACTORS, [{ id: 'x', from: 'laptop', to: ['relay', 'nobody'], label: '' }])).toThrow(RangeError);
  });
});

describe('notes', () => {
  const PAIR: SeqActor[] = [
    { id: 'a', label: 'Laptop' },
    { id: 'b', label: 'Server' },
  ];
  const note = '0.0.0.0:68 → 255.255.255.255:67';

  it('wrap to two lines before the lanes widen, and the next row starts below both', () => {
    const L = sequenceLayout(PAIR, [
      { id: 'm', from: 'a', to: 'b', label: 'DHCPDISCOVER', note },
      { id: 'n', from: 'b', to: 'a', label: 'DHCPOFFER' },
    ]);
    const [m, n] = L.rows;
    expect(m.noteLines).toHaveLength(2);
    expect(m.noteLines.join(' ')).toBe(note);
    for (const line of m.noteLines) expect(textWidth(line)).toBeLessThanOrEqual(Math.abs(m.x2 - m.x1) - SEQ.PAD * 2 + 1e-9);
    expect(m.bottom).toBe(m.noteY! + SEQ.NOTE_H);
    expect(n.labelY - SEQ.LINE_H).toBeGreaterThanOrEqual(m.bottom);
    // one line of note would have needed a wider gap than the two-line wrap
    expect(L.lanes.b - L.lanes.a).toBeLessThan(textWidth(note) + SEQ.PAD * 2);
  });

  it('stay on one line with wrapNotes: false, widening the lanes instead', () => {
    const msgs: SeqMessage[] = [{ id: 'm', from: 'a', to: 'b', label: 'DHCPDISCOVER', note }];
    const roomy = sequenceLayout(PAIR, msgs, undefined, { wrapNotes: false });
    const compact = sequenceLayout(PAIR, msgs);
    expect(roomy.rows[0].noteLines).toEqual([note]);
    expect(roomy.lanes.b - roomy.lanes.a).toBe(Math.ceil(textWidth(note) + SEQ.PAD * 2));
    expect(roomy.width).toBeGreaterThan(compact.width);
    expect(roomy.height).toBeLessThan(compact.height);
  });

  it('pickLayout keeps the roomy layout while it renders at ROOMY_MIN_SCALE or more', () => {
    const msgs: SeqMessage[] = [{ id: 'm', from: 'a', to: 'b', label: 'DHCPDISCOVER', note }];
    const roomy = sequenceLayout(PAIR, msgs, undefined, { wrapNotes: false });
    const compact = sequenceLayout(PAIR, msgs);
    expect(pickLayout(roomy, compact, null)).toBe(roomy);
    expect(pickLayout(roomy, compact, roomy.width)).toBe(roomy);
    expect(pickLayout(roomy, compact, Math.ceil(roomy.width * ROOMY_MIN_SCALE))).toBe(roomy);
    expect(pickLayout(roomy, compact, Math.floor(roomy.width * ROOMY_MIN_SCALE) - 1)).toBe(compact);
  });

  it('a short note stays on one line, with the old spacing', () => {
    const L = sequenceLayout(PAIR, [{ id: 'm', from: 'a', to: 'b', label: 'SYN', note: 'retry in 2 s' }]);
    expect(L.rows[0].noteLines).toEqual(['retry in 2 s']);
    expect(L.rows[0].noteY).toBe(L.rows[0].y + SEQ.NOTE_H);
  });
});

describe('self-messages on the last lifeline', () => {
  it('get room on the right instead of running off the drawing', () => {
    const actors: SeqActor[] = [
      { id: 'a', label: 'Laptop' },
      { id: 'b', label: 'Server A' },
      { id: 'c', label: 'Server B' },
    ];
    const L = sequenceLayout(actors, [{ id: 'w', from: 'c', to: 'c', label: 'withdraw 192.168.1.200' }]);
    const w = L.rows[0];
    const right = w.labelX + Math.max(...w.lines.map(textWidth));
    expect(right).toBeLessThanOrEqual(L.width);
    // the lanes keep their spacing; only the right margin grows
    expect(L.lanes.b - L.lanes.a).toBeCloseTo(L.lanes.c - L.lanes.b, 9);
    expect(L.lanes.b - L.lanes.a).toBe(SEQ.MIN_GAP);
  });

  it('leave a diagram without them exactly as wide as before', () => {
    expect(sequenceLayout(DORA_ACTORS, DORA).width).toBe(sequenceLayout(DORA_ACTORS, DORA.filter((m) => m.id !== 's')).width);
  });
});

describe('shownExtent', () => {
  const L = sequenceLayout(DORA_ACTORS, DORA);

  it('ends the lifelines under the last shown row', () => {
    expect(shownExtent(L, 2).lifelineEnd).toBe(L.rows[1].bottom + SEQ.ROW_GAP);
    expect(shownExtent(L, 2).height).toBe(L.rows[1].bottom + SEQ.ROW_GAP + SEQ.FOOT);
    expect(shownExtent(L, 0).lifelineEnd).toBe(L.head.h + SEQ.ROW_GAP);
  });

  it('is the full layout once every row shows', () => {
    expect(shownExtent(L, DORA.length)).toEqual({ lifelineEnd: L.lifelineEnd, height: L.height });
  });

  it('grows with each step', () => {
    const heights = DORA.map((_, i) => shownExtent(L, i + 1).height);
    heights.forEach((h, i) => i > 0 && expect(h).toBeGreaterThan(heights[i - 1]));
  });
});
