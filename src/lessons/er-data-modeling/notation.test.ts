import { describe, expect, it } from 'vitest';
import { endMarks } from './notation';

const at = { x: 100, y: 50 };
const right = { x: 1, y: 0 };

describe("crow's-foot marks", () => {
  it('many = a three-line crow\'s foot touching the entity, one = a single bar', () => {
    const many = endMarks(at, right, { min: 0, max: 'N' }).filter((m) => m.kind === 'line');
    expect(many).toHaveLength(3);
    for (const m of many) if (m.kind === 'line') expect(m.to.x).toBe(100); // the prongs meet the entity edge
    const one = endMarks(at, right, { min: 0, max: '1' }).filter((m) => m.kind === 'line');
    expect(one).toHaveLength(1);
  });
  it('zero allowed = a circle, at least one = a second bar further out', () => {
    expect(endMarks(at, right, { min: 0, max: '1' }).some((m) => m.kind === 'circle')).toBe(true);
    const required = endMarks(at, right, { min: 1, max: '1' });
    expect(required.every((m) => m.kind === 'line')).toBe(true);
    expect(required).toHaveLength(2);
  });
  it('points the marks away from the entity, whatever the direction', () => {
    const up = endMarks(at, { x: 0, y: -40 }, { min: 0, max: '1' });
    const circle = up.find((m) => m.kind === 'circle');
    expect(circle && circle.kind === 'circle' && circle.at.y < at.y).toBe(true);
  });
});
