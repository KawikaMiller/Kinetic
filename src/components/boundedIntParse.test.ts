import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { costFieldMessages } from '../lessons/attention-transformers/fieldMessages';
import { BoundedIntField } from './BoundedIntField';
import { parseBoundedIntField } from './boundedIntParse';

const refusal = (text: string, label: string, min: number, max: number, messages?: Parameters<typeof parseBoundedIntField>[4]) => {
  const r = parseBoundedIntField(text, label, min, max, messages);
  return r.ok ? r.value : r.error;
};

describe('standard refusal wording (pinned from the four lesson copies this replaced)', () => {
  it('llm-serving, fine-tuning-quantization, feature-stores-skew and finops-cloud-cost keep their sentences', () => {
    expect(refusal('', 'Prompt tokens', 1, 8192)).toBe('Prompt tokens: type a whole number from 1 to 8,192.');
    expect(refusal('abc', 'rank r', 1, 4096)).toBe('"abc" is not a whole number.');
    expect(refusal('2.5', 'd_in', 1, 16384)).toBe('"2.5" is not a whole number.');
    expect(refusal('1e3', 'Window (days)', 1, 30)).toBe('"1e3" is not a whole number.');
    expect(refusal('-1', 'Committed instances', 0, 8)).toBe('Committed instances: the smallest allowed value is 0.');
    expect(refusal('0', 'Users', 1, 40)).toBe('Users: the smallest allowed value is 1.');
    expect(refusal('99999', 'Sequence tokens', 1, 8192)).toBe('Sequence tokens: the largest allowed value is 8,192.');
    expect(refusal('9', 'Committed instances', 0, 8)).toBe('Committed instances: the largest allowed value is 8.');
  });

  it('accepts thousands commas and refuses a bad grouping', () => {
    expect(refusal('8,192', 'Prompt tokens', 1, 8192)).toBe(8192);
    expect(refusal('1,00', 'Prompt tokens', 1, 8192)).toBe('"1,00" is not a whole number.');
  });
});

describe('attention-transformers wording (pinned from CostField)', () => {
  it('keeps its own sentences through the messages prop', () => {
    expect(refusal('', 'heads', 1, 16, costFieldMessages)).toBe('Type a whole number for heads.');
    expect(refusal('x', 'heads', 1, 16, costFieldMessages)).toBe('"x" isn\'t a whole number.');
    expect(refusal('0', 'heads', 1, 16, costFieldMessages)).toBe('heads has to be at least 1.');
    expect(refusal('4096', 'n (tokens)', 1, 2048, costFieldMessages)).toBe('n (tokens) goes up to 2,048 here.');
  });
});

describe('BoundedIntField', () => {
  const html = (value: number, className?: string) => renderToStaticMarkup(
    createElement(BoundedIntField, { label: 'Users', value, min: 1, max: 40_000, onValue: () => undefined, className }),
  );

  it('shows the value grouped, labelled for assistive tech, with no refusal until something is refused', () => {
    expect(html(12_345)).toContain('value="12,345"');
    expect(html(12_345)).toContain('aria-label="Users"');
    expect(html(12_345)).not.toContain('int-field-refusal');
  });

  it('adds a lesson class to the wrapper', () => {
    expect(html(5, 'x-field')).toContain('class="int-field x-field"');
  });
});
