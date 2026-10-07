import { describe, expect, it } from 'vitest';
import { SEQ, sequenceLayout, textWidth, wrapLabel, type SeqActor, type SeqMessage } from './sequenceLayout';

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
    expect((SEQ.FONT * L.minWidth) / L.width).toBeGreaterThanOrEqual(SEQ.MIN_TEXT_PX);
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
