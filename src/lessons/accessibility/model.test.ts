import { describe, expect, it } from 'vitest';
import {
  ALL_FIXED, NONE_FIXED, SIGNED_UP, accessibleName, announce, buildTree, tabOrder,
} from './model';

describe('accessibleName', () => {
  it('prefers aria-label, then label, then alt, then content, then placeholder', () => {
    expect(accessibleName({ ariaLabel: 'A', label: 'B', content: 'C' })).toBe('A');
    expect(accessibleName({ label: 'B', placeholder: 'P' })).toBe('B');
    expect(accessibleName({ alt: 'Logo' })).toBe('Logo');
    expect(accessibleName({ content: ' Sign up ' })).toBe('Sign up');
    expect(accessibleName({ placeholder: 'you@example.com' })).toBe('you@example.com');
    expect(accessibleName({})).toBe('');
  });
});

describe('tab order', () => {
  it('positive tabindex jumps ahead of the natural order', () => {
    const order = tabOrder(buildTree(NONE_FIXED, { errorShown: false })).map((n) => n.id);
    expect(order).toEqual(['news', 'email']); // the div "button" isn't focusable at all
  });
  it('fixed: natural DOM order, and the real button is a stop', () => {
    expect(tabOrder(buildTree(ALL_FIXED, { errorShown: false })).map((n) => n.id)).toEqual(['email', 'news', 'submit']);
  });
  it('tabindex -1 is never a Tab stop; ties keep DOM order', () => {
    const nodes = [
      { id: 'a', focusable: true, tabindex: 2 },
      { id: 'b', focusable: true, tabindex: -1 },
      { id: 'c', focusable: true, tabindex: 1 },
      { id: 'd', focusable: true, tabindex: 2 },
      { id: 'e', focusable: true, tabindex: null },
    ];
    expect(tabOrder(nodes).map((n) => n.id)).toEqual(['c', 'a', 'd', 'e']);
  });
});

describe('the form model', () => {
  it('broken: every fixable node reports an issue', () => {
    const issues = buildTree(NONE_FIXED, { errorShown: true }).filter((n) => n.issue).map((n) => n.id);
    expect(issues).toEqual(['logo', 'title', 'email', 'news', 'submit', 'error']);
  });
  it('fixed: no issues, and the right roles', () => {
    const tree = buildTree(ALL_FIXED, { errorShown: true });
    expect(tree.filter((n) => n.issue)).toEqual([]);
    expect(Object.fromEntries(tree.map((n) => [n.id, n.role]))).toMatchObject({
      logo: 'img', title: 'heading', email: 'textbox', submit: 'button', error: 'alert',
    });
  });
  it('announces nodes the way a screen reader would', () => {
    const tree = buildTree(ALL_FIXED, { errorShown: true });
    const say = (id: string) => announce(tree.find((n) => n.id === id)!);
    expect(say('email')).toBe('Email, edit text');
    expect(say('submit')).toBe('Sign up, button');
    expect(say('title')).toBe('Create your account, heading level 2');
    expect(say('error')).toBe('Alert: Please enter your email address.');
    expect(announce(buildTree(NONE_FIXED, { errorShown: false }).find((n) => n.id === 'logo')!)).toBe('unlabelled image');
  });
});

describe('the reader reads the form as it is now', () => {
  it('announces the checkbox state the learner set', () => {
    const news = (newsletter: boolean) => buildTree(ALL_FIXED, { errorShown: false, newsletter }).find((n) => n.id === 'news')!;
    expect(news(false).state).toBe('not checked');
    expect(news(true).state).toBe('checked');
  });
  it('only announces a confirmation that is really on the page', () => {
    expect(buildTree(ALL_FIXED, { errorShown: false }).some((n) => n.id === 'done')).toBe(false);
    expect(buildTree(ALL_FIXED, { errorShown: false, signedUp: true }).find((n) => n.id === 'done')).toMatchObject({ role: 'status', name: SIGNED_UP });
    expect(buildTree(NONE_FIXED, { errorShown: false, signedUp: true }).find((n) => n.id === 'done')?.issue).toBeTruthy();
  });
});
