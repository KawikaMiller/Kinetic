import { describe, expect, it } from 'vitest';
import { BACKGROUND_BUDGET_S, EMPTY_FEED, MESSAGES_PER_DAY, WAKE_COST_PCT, pollingDay, pushDay, refreshFeed, runInBackground, setNetwork } from './constraints';

describe('background budget', () => {
  it('a task shorter than the budget finishes', () => {
    expect(runInBackground(12, false)).toEqual({ done: 12, finished: true, remaining: 0, redo: 0 });
  });

  it('a task exactly at the budget still finishes', () => {
    expect(runInBackground(BACKGROUND_BUDGET_S, false).finished).toBe(true);
  });

  it('a longer task is cut off at the budget, and without a checkpoint all of that work is done again', () => {
    expect(runInBackground(45, false)).toEqual({ done: BACKGROUND_BUDGET_S, finished: false, remaining: 15, redo: BACKGROUND_BUDGET_S });
  });

  it('with a checkpoint only the remainder is left', () => {
    expect(runInBackground(45, true)).toEqual({ done: BACKGROUND_BUDGET_S, finished: false, remaining: 15, redo: 0 });
  });

  it('the work done plus the work left is always the whole task', () => {
    for (let work = 5; work <= 60; work++) {
      const run = runInBackground(work, work % 2 === 0);
      expect(run.done + run.remaining).toBe(work);
    }
  });
});

describe('polling and push', () => {
  it('polling every 5 minutes wakes the app 288 times a day, and every 60 minutes 24 times', () => {
    expect(pollingDay(5).wakeups).toBe(288);
    expect(pollingDay(60).wakeups).toBe(24);
  });

  it('battery is the wake-ups times what one wake-up costs', () => {
    expect(pollingDay(10).batteryPct).toBeCloseTo(144 * WAKE_COST_PCT, 10);
    expect(pushDay().batteryPct).toBeCloseTo(MESSAGES_PER_DAY * WAKE_COST_PCT, 10);
  });

  it('push never wakes for nothing, and polling mostly does at any interval here', () => {
    expect(pushDay().empty).toBe(0);
    for (let minutes = 1; minutes <= 60; minutes++) expect(pollingDay(minutes).empty).toBeGreaterThan(0);
  });

  it('polling more often never costs less', () => {
    for (let minutes = 2; minutes <= 60; minutes++) expect(pollingDay(minutes - 1).batteryPct).toBeGreaterThanOrEqual(pollingDay(minutes).batteryPct);
  });
});

describe('a flaky network', () => {
  it('a refresh offline fails and waits, and the network coming back finishes it', () => {
    const failed = refreshFeed(EMPTY_FEED, false);
    expect(failed).toEqual({ status: 'failed', pending: true, loads: 0 });
    expect(setNetwork(failed, true)).toEqual({ status: 'loaded', pending: false, loads: 1 });
  });

  it('coming back online with nothing waiting changes nothing, and going offline never loads', () => {
    expect(setNetwork(EMPTY_FEED, true)).toBe(EMPTY_FEED);
    expect(setNetwork(refreshFeed(EMPTY_FEED, false), false).loads).toBe(0);
  });

  it('a refresh online loads at once', () => {
    expect(refreshFeed(EMPTY_FEED, true).status).toBe('loaded');
  });
});
