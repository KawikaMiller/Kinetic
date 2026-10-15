import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { CHANGES, CLIENTS, DEFAULT_NAME, rowFor } from './api';
import { changeCaption, strategyCaption, sunsetCaption } from './captions';
import { MIGRATION_RANGE, RELEASE_RANGE, STRATEGIES, liveVersions, yearlyCost } from './strategies';
import { CHOICES, WINDOW, simulate } from './sunset';

describe('change captions state what the matrix shows', () => {
  it('says how many clients break, for every change', () => {
    for (const change of CHANGES) {
      const row = rowFor(change, DEFAULT_NAME);
      const text = expectCaption(changeCaption(change, DEFAULT_NAME));
      if (row.broken) expect(text, change.id).toContain(`breaks ${row.broken} of ${CLIENTS.length} clients`);
      else expect(text, change.id).not.toContain('breaks ');
      const changed = CLIENTS.filter((c) => row.cells[c.id].status === 'changed');
      expect(text.includes('silently changes the result'), change.id).toBe(changed.length > 0);
    }
  });

  it('pins four sentences', () => {
    expect(changeCaption(CHANGES[0], 'nickname')).toBe(
      'Add an optional response field: breaks 1 of 4 clients (Partner integration: unexpected property nickname). Verdict: breaks a strict reader only.',
    );
    expect(changeCaption(CHANGES[6], DEFAULT_NAME)).toBe(
      'Change the default sort order: silently changes the result for Batch job. Verdict: silent behaviour change.',
    );
    expect(changeCaption(CHANGES[1], DEFAULT_NAME)).toContain('breaks 4 of 4 clients');
    expect(changeCaption(CHANGES[7], DEFAULT_NAME)).toContain('Web page: unexpected status 410 for a missing user');
  });

  it('follows the typed name', () => {
    expect(changeCaption(CHANGES[0], 'handle')).toContain('unexpected property handle');
    expect(changeCaption(CHANGES[3], 'full_name')).toContain('breaks 3 of 4 clients');
  });
});

describe('strategy captions follow the model at every setting', () => {
  it('state the live versions and the cost the stats show, including the slider extremes', () => {
    for (const s of STRATEGIES) {
      for (const releases of [RELEASE_RANGE.min, 2, RELEASE_RANGE.max]) {
        for (const months of [MIGRATION_RANGE.min, 18, MIGRATION_RANGE.max]) {
          const text = expectCaption(strategyCaption(s.id, CHANGES[3], DEFAULT_NAME, false, releases, months));
          const live = liveVersions(s.id, releases, months);
          if (s.id === 'additive') {
            expect(text, `${releases} ${months}`).toContain(`One version stays live whatever the release rate or migration time, about ${yearlyCost(live)} engineer-days`);
            expect(text).not.toContain('months to migrate');
            expect(text).not.toContain('up to');
          } else {
            expect(text, `${s.id} ${releases} ${months}`).toContain(`With ${releases} release${releases === 1 ? '' : 's'} a year and ${months} months to migrate, up to ${live} versions stay live, about ${yearlyCost(live)} engineer-days`);
          }
        }
      }
    }
  });

  it('says the cache serves the wrong body exactly for a header version without Vary', () => {
    for (const s of STRATEGIES) {
      for (const vary of [false, true]) {
        const text = strategyCaption(s.id, CHANGES[3], DEFAULT_NAME, vary, 2, 18);
        const wrong = text.includes('serves the v2 client the v1 body');
        expect(wrong, `${s.id} ${vary}`).toBe((s.id === 'header' || s.id === 'dated') && !vary);
      }
    }
  });

  it('for additive-only, the caption is identical at every slider setting, because the sliders do nothing', () => {
    const texts = new Set<string>();
    for (const releases of [RELEASE_RANGE.min, 2, RELEASE_RANGE.max]) {
      for (const months of [MIGRATION_RANGE.min, 18, MIGRATION_RANGE.max]) texts.add(strategyCaption('additive', CHANGES[3], DEFAULT_NAME, false, releases, months));
    }
    expect(texts.size).toBe(1);
  });

  it('pins two sentences', () => {
    expect(strategyCaption('path', CHANGES[3], DEFAULT_NAME, false, 2, 18)).toBe(
      'Version in the URL path. It breaks at least one client, so it ships as a new version and the old one stays up. A shared cache keeps the two versions apart. With 2 releases a year and 18 months to migrate, up to 4 versions stay live, about 240 engineer-days a year (an illustrative figure).',
    );
    expect(strategyCaption('header', CHANGES[3], DEFAULT_NAME, false, 2, 18)).toContain(
      'A shared cache serves the v2 client the v1 body, because the response does not say it varies by the version header.',
    );
  });
});

describe('sunset captions follow the simulation at every window and choice', () => {
  it('count the clients left on the old version and the planned failure', () => {
    for (const { id } of CHOICES) {
      for (let w = WINDOW.min; w <= WINDOW.max; w += 13) {
        const o = simulate(w, id);
        const text = expectCaption(sunsetCaption(w, id));
        const left = o.clients.filter((c) => c.onOldAtSunset).length;
        if (left) expect(text, `${id} ${w}`).toContain(`${left} client${left === 1 ? '' : 's'} (`);
        else expect(text, `${id} ${w}`).toContain('every client has migrated before it goes');
        expect(text.includes('client-hour'), `${id} ${w}`).toBe(o.plannedClientHours > 0);
      }
    }
  });

  it('pins the default sentence', () => {
    expect(sunsetCaption(90, 'break')).toBe(
      '90 days between announcement and sunset, and you break them: the old version goes on 2027-01-31, and 2 clients (Partner integration and Batch job) still on the old version when it goes.',
    );
  });
});
