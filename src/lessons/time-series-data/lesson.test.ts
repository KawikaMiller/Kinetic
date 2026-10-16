import { describe, expect, it } from 'vitest';
import { TOPICS } from '../../core/curriculum';
import { decimal } from '../../core/format';
import { lintLesson } from '../../core/lessonContent';
import { lintTier3Lesson } from '../../core/lessonContentT3';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements } from '../../core/testing/sceneKeys';
import { cardinalityCaption, encoderCaption, rawCaption, retentionCaption, rollupCaption } from './captions';
import { cardinalityFacts, defaultSeries, encoderFacts, gapFacts, retentionFacts, spikeFacts } from './facts';
import { bitsPerPoint, decode, encode, ratioAgainstRaw } from './gorilla';
import lesson from './index';
import { initialCardinalityScene, initialEncoderScene, initialRawScene, initialRetentionScene, initialRollupScene } from './init';
import { DEFAULT_POLICY, SPIKE_AGE_DAYS, WINDOWS, bytesPerDay, seriesCount, spikeAfter, storage, tierCovering, type Policy } from './retention';
import { AGGREGATES, HOUR, MINUTE, POINTS_PER_DAY, buildSeries, patternSeries, rollup, spikePeak, valueOf, type Aggregate, type TimestampPattern, type ValuePattern } from './series';

const plain = (node: Parameters<typeof captionText>[0]) => captionText(node, { strict: true });
const n = (x: number) => x.toLocaleString('en-US');

describe('each scene opens on the state its try-this assumes (a pure function, switched through all five scenes)', () => {
  it('raw: the default seed, noise and spike, the whole day in view', () => expect(initialRawScene()).toMatchObject({ seed: 7, noise: 0.3, spike: 4.5, from: 0, to: 24 }));
  it('rollup: one-hour buckets by average with no gap', () => expect(initialRollupScene()).toEqual({ bucket: 'hour', aggregate: 'avg', gap: false }));
  it('encoder: regular timestamps and constant values', () => expect(initialEncoderScene()).toEqual({ ts: 'regular', vs: 'constant' }));
  it('retention: the default policy and a week-long window', () => {
    const s = initialRetentionScene();
    expect(s.policy).toEqual(DEFAULT_POLICY);
    expect(s.window).toBe('week');
  });
  it('cardinality: no user id label', () => expect(initialCardinalityScene().withUser).toBe(false));
  it('every scene the Stage returns carries its own key', () => {
    const scenes = sceneElements('time-series-data');
    expect(scenes).toHaveLength(5);
    expect(scenes.every((s) => s.keyed)).toBe(true);
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: 8,640 points are 135 KB; the zoom 13 to 15 holds 720 points, and the spike is 12 of them', () => {
    const s = defaultSeries();
    expect(s).toHaveLength(8640);
    const inView = s.filter((p) => p.t >= s[0].t + 13 * 3600 && p.t < s[0].t + 15 * 3600).length;
    expect(inView).toBe(720);
    expect(lesson.tryThis[0]).toContain('a day is 8,640 points, 135.0 KB at 16 bytes a point');
    expect(lesson.tryThis[0]).toContain('720 points are in view and the spike is a rise of 12 of them');
    expect(plain(rawCaption(inView, s.length, inView * 16, 11, 4.5))).toContain('720 of 8,640 points in view');
  });

  it('try-this 2: the hour average is below the raw peak and the max equals it; the gap makes the average of averages differ from the exact one', () => {
    const f = spikeFacts();
    expect(f.max).toBe(f.peak);
    expect(f.avg).toBeLessThan(f.peak - 2);
    const g = gapFacts();
    expect(g.diff).toBeGreaterThan(0.01);
    expect(lesson.tryThis[1]).toContain(`shows the spike's bucket as ${decimal(f.avg, 2)} against a raw peak of ${decimal(f.peak, 2)}`);
    expect(lesson.tryThis[1]).toContain(`Pick Max: it shows ${decimal(f.max, 2)}`);
    expect(lesson.tryThis[1]).toContain(`the average of averages is ${decimal(g.naive, 3)}`);
    const s = initialRollupScene();
    const buckets = rollup(defaultSeries(), s.bucket === 'hour' ? HOUR : MINUTE);
    expect(buckets).toHaveLength(24);
  });

  it('try-this 3: regular and constant takes under 3 bits a point and noisy floats over 20', () => {
    const f = encoderFacts();
    expect(f.regular).toBeLessThan(3);
    expect(f.noisy).toBeGreaterThan(20);
    expect(lesson.tryThis[2]).toContain(`take ${decimal(f.regular, 1)} bits a point, ${decimal(f.regularRatio, 1)} times smaller than raw`);
    expect(lesson.tryThis[2]).toContain(`Noisy floats: ${decimal(f.noisy, 1)} bits a point`);
  });

  it('try-this 4: by default the last week comes from the minute tier and last month\'s spike is erased; keeping max makes it visible', () => {
    const f = retentionFacts();
    expect(tierCovering(DEFAULT_POLICY, 7)).toBe('minute');
    expect(f.spikeAvg.visible).toBe(false);
    expect(f.spikeFull.visible).toBe(true);
    expect(lesson.tryThis[3]).toContain('comes from 1-minute rollups');
    expect(lesson.tryThis[3]).toContain(`from ${SPIKE_AGE_DAYS} days ago is erased`);
    expect(lesson.tryThis[3]).toContain('Switch Rollups keep to sum, count, min, max: it is visible');
  });

  it('try-this 5: the four labels give 40,000 series; a user id makes it 400,000,000 and the raw bytes a day grow by 10,000 times', () => {
    const f = cardinalityFacts();
    expect(f.base).toBe(8 * 25 * 5 * 40);
    expect(f.withUser).toBe(f.base * 10_000);
    expect(f.userDay / f.baseDay).toBe(10_000);
    expect(lesson.tryThis[4]).toContain('the four labels give at most 40,000 series');
    expect(lesson.tryThis[4]).toContain('1 in 100: 4,000,000 series');
    expect(lesson.tryThis[4]).toContain('400,000,000');
  });
});

describe('captions are computed from the model over the control cross product', () => {
  it('rollup: every bucket x aggregate x gap quotes the spike\'s bucket value, and calls it kept or lost by the halfway rule', () => {
    for (const bucket of [MINUTE, HOUR]) {
      for (const a of AGGREGATES.map((x) => x.value) as Aggregate[]) {
        const data = defaultSeries();
        const b = rollup(data, bucket).find((x) => x.start <= data[5000].t && data[5000].t < x.start + bucket)!;
        const shown = valueOf(b, a);
        const inB = data.filter((p) => p.t >= b.start && p.t < b.start + bucket).map((p) => p.v).sort((x, y) => x - y);
        const typical = inB[Math.floor(inB.length / 2)];
        const peak = spikePeak(data);
        const text = plain(rollupCaption(bucket === HOUR ? '1-hour' : '1-minute', a, shown, peak, typical, 1, 1));
        expect(text, `${bucket} ${a}`).toContain(decimal(shown, 2));
      }
    }
    expect(valueOf(rollup(defaultSeries(), HOUR)[0], 'count')).toBe(360);
  });

  it('encoder: every timestamp x value pattern says the bits a point the encoder produced, and that it decodes back', () => {
    for (const t of ['regular', 'jittery', 'gap'] as TimestampPattern[]) {
      for (const v of ['constant', 'drifting', 'noisy'] as ValuePattern[]) {
        const s = patternSeries(t, v);
        const e = encode(s);
        const back = decode(e.bits, s.length);
        const ok = back.every((p, i) => p.t === s[i].t && Object.is(p.v, s[i].v));
        const text = plain(encoderCaption(t, v, bitsPerPoint(e), ratioAgainstRaw(e), s.length, ok));
        expect(text, `${t} ${v}`).toContain(`${decimal(bitsPerPoint(e), 1)} bits a point`);
        expect(text).toContain('bit for bit: yes');
      }
    }
  });

  it('retention: policies across the sliders say the same tier, spike verdict and storage as the model', () => {
    const windows = WINDOWS;
    for (const raw of [1, 2, 30]) {
      for (const minute of [1, 14, 90]) {
        for (const hour of [1, 365, 730]) {
          for (const keeps of ['average', 'full'] as const) {
            const p: Policy = { days: { raw, minute, hour }, keeps };
            for (const w of windows) {
              const spike = spikeAfter(p, SPIKE_AGE_DAYS);
              const text = plain(retentionCaption(p, w.label, tierCovering(p, w.days), storage(p).total, spike));
              const id = `${raw}/${minute}/${hour} ${keeps} ${w.id}`;
              expect(text.includes('no tier'), id).toBe(tierCovering(p, w.days) === null);
              expect(text.includes('gone'), id).toBe(spike.tier === null);
              expect(text.includes('erased'), id).toBe(spike.tier !== null && !spike.visible);
              expect(text.includes('still visible'), id).toBe(spike.visible);
            }
          }
        }
      }
    }
  });

  it('cardinality: the caption quotes the series count for every slider extreme with and without the user id', () => {
    for (const withUser of [false, true]) {
      for (const labels of [{ service: 1, endpoint: 1, status: 1, host: 1 }, { service: 50, endpoint: 100, status: 10, host: 200 }]) {
        const c = seriesCount(labels, withUser);
        expect(plain(cardinalityCaption(c, c, withUser, bytesPerDay(c), null))).toContain(`${n(c)} series`);
      }
    }
  });
});

describe('no hidden control feeds a number', () => {
  it('the zoom range changes what is in view but never the stored size or the highest point', () => {
    const s = buildSeries({ seed: 7, noise: 0.3, spike: 4.5 });
    expect(s).toHaveLength(POINTS_PER_DAY);
    expect(Math.max(...s.map((p) => p.v))).toBe(Math.max(...buildSeries({ seed: 7, noise: 0.3, spike: 4.5 }).map((p) => p.v)));
  });
  it('retention days of a tier change its own storage and no other tier\'s', () => {
    const base = storage(DEFAULT_POLICY);
    const more = storage({ ...DEFAULT_POLICY, days: { ...DEFAULT_POLICY.days, raw: 10 } });
    expect(more.minute).toBe(base.minute);
    expect(more.hour).toBe(base.hour);
    expect(more.raw).toBe(5 * base.raw);
  });
  it('the keep-rollups switch changes rollup bytes and never raw bytes', () => {
    expect(storage({ ...DEFAULT_POLICY, keeps: 'full' }).raw).toBe(storage(DEFAULT_POLICY).raw);
  });
});

describe('lesson content', () => {
  it('passes the K-2 content lint and the Tier 3 lint (absolutes, chips, try-this tests)', () => {
    const own = Object.values(import.meta.glob<string>('./index.tsx', { query: '?raw', import: 'default', eager: true })).join('');
    expect(lintLesson(lesson, new Set(TOPICS.map((t) => t.id)))).toEqual([]);
    expect(lintTier3Lesson(lesson, { domainReview: false, source: own, tryThisTests: lesson.tryThis.map((_, i) => i + 1) })).toEqual([]);
  });
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
