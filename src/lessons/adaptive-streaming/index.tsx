import type { LessonModule } from '../../core/types';
import { DEFAULT_WEIGHTS, LADDER, SEGMENT, score, simulate, traceOf, type AlgoId, type TraceId, type Weights } from './abr';
import { CACHE, CATALOGUE, DEFAULT_SEED, LIVE, LONG_TAIL_FROM, POPULAR_RANK, TAIL_RANK, ZIPF, liveLatency, rankBucket, replay, requestStream, titleRatio } from './cdn';
import { initialCompare, initialLadder, initialPlayer } from './init';
import { LADDER_SIZES, POPULATION_SEED, evaluate, population } from './ladder';
import { Stage } from './Stage';

const run = (trace: TraceId, algo: AlgoId, S: number = SEGMENT.initial) => simulate(traceOf(trace, 1), S, algo);
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number | null) => (x === null ? 'none' : `${Math.round(x * 100)}%`);

const p0 = initialPlayer();
const rateDrop = run(p0.trace, p0.algo);
const bufferDrop = run(p0.trace, 'buffer');
const naiveDrop = run(p0.trace, 'naive');
const naiveSteady = run('steady', 'naive');
const TOP = LADDER[LADDER.length - 1];
const STEADY_RATE = traceOf('steady', 1)[0];
const LIVE_QUIZ_SEGMENT = 6;

const c0 = initialCompare();
const compareRuns = (['naive', 'rate', 'buffer'] as const).map((a) => ({ a, r: run(c0.trace, a, c0.S) }));
const top = (w: Weights) => compareRuns.reduce((m, x) => (score(x.r, w) > score(m.r, w) ? x : m)).a;
const winnerDefault = top(DEFAULT_WEIGHTS);
const picky: Weights = { ...DEFAULT_WEIGHTS, bitrate: 5, stall: 0 };
const winnerPicky = top(picky);
const NAME: Record<AlgoId, string> = { naive: 'naive', rate: 'rate-based', buffer: 'buffer-based' };

const stream = requestStream(DEFAULT_SEED, ZIPF.initial);
const cdn0 = replay(stream, CACHE.initial);
const cdnFull = replay(stream, CACHE.max);
const pop0 = titleRatio(cdn0, POPULAR_RANK);
const tail0 = titleRatio(cdn0, TAIL_RANK);
const longTail0 = rankBucket(cdn0, LONG_TAIL_FROM, CATALOGUE);

const l0 = initialLadder();
const ladders = LADDER_SIZES.map((n) => evaluate(n, population(POPULATION_SEED, l0.slow)));
const laddersSlow = LADDER_SIZES.map((n) => evaluate(n, population(POPULATION_SEED, 100)));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Streaming video is not a special protocol: it is small files over HTTP, and the player picks a quality for each file from what it measures. The buffer is its safety margin, and with the default weights a stall costs more than a lower quality.',
    what: 'The server cuts the video into segments of a few seconds and keeps each at several bitrates (the ladder). The player downloads one segment at a time and chooses the rendition for the next one, either from the throughput it just measured or from how much video it already holds. The buffer fills when a segment lands faster than it plays and empties while it plays; if it empties, the picture freezes. Because segments are ordinary files, a CDN cache serves popular ones from the edge.',
    analogy: 'Filling a bath while the water runs out of the drain at a fixed rate. The tap (the network) changes all the time; you choose how big a bucket (the rendition) to fetch next so the bath never runs dry, without always settling for the smallest bucket.',
    useCases: [
      'Explaining why a video drops to a blurry picture for a few seconds instead of stopping',
      'Designing a bitrate ladder and a segment length for a video service',
      'Reasoning about origin load and CDN cache hit ratio for popular and unpopular titles',
      'Understanding why live streams run behind real time by several seconds',
    ],
    why: 'Video is a large share of internet traffic and a classic system-design question. The same few ideas (segments, a buffer, a ladder, a cache) explain startup time, rebuffering, quality switches and delivery cost.',
    watch:
      'The grey staircase is the network throughput. Yellow lines show the bitrate each segment was fetched at, and the yellow ring on a download bar marks the segment that just landed. The blue curve is the buffer in seconds, red on the floor of it is a stall, and in the timeline a red bar is a stall and a grey bar is playback. Each rendition has a plain tint and its number r1 to r5 in the bar, since five rungs reuse four tints. In the comparison the three players have their own tints (pink, amber, sky) and a green row is the highest score by your weights. In the cache scene green is a hit and red a miss; in the ladder scene green is viewers who can play, blue the bitrate they get and red the storage cost. The chips say what is simulated, illustrative or from memory.',
  },
  tryThis: [
    `In "The player" (a network that drops, the rate-based player, ${SEGMENT.initial} s segments) watch the run (press restart to see it again): the buffer is filled at the start, then the throughput falls to 0.5 Mbit/s and the player stalls ${rateDrop.stallCount} time for ${f1(rateDrop.stallTime)} s. Pick the buffer-based player: ${f1(bufferDrop.stallTime)} s stalled, at an average bitrate of ${f2(bufferDrop.avgBitrate)} Mbit/s against ${f2(rateDrop.avgBitrate)}.`,
    `Pick the naive player (always the top rendition, ${LADDER[LADDER.length - 1]} Mbit/s) and the network "steady" (4 Mbit/s): ${naiveSteady.stallCount} of its ${naiveSteady.count} segments stall, ${f1(naiveSteady.stallTime)} s in all, because each takes longer to download than it plays. On "a drop" it stalls ${f1(naiveDrop.stallTime)} s.`,
    `In "Three algorithms" (a drop) the stalled time is ${compareRuns.map((x) => `${NAME[x.a]} ${f1(x.r.stallTime)} s`).join(', ')}, and the ${NAME[winnerDefault]} player scores highest by the default weights. Set "Reward per Mbit/s of bitrate" to 5 and "Penalty per second stalled" to 0: the ${NAME[winnerPicky]} player wins.`,
    `In "Why it scales" (skew ${ZIPF.initial.toFixed(1)}, a cache of ${CACHE.initial.toLocaleString('en-US')} segments) the most popular title hits ${pct(pop0.ratio)} of ${pop0.requests.toLocaleString('en-US')} requests and title ${TAIL_RANK} hits ${pct(tail0.ratio)} of ${tail0.requests}. Set the cache to ${CACHE.max.toLocaleString('en-US')} segments (the whole catalogue): the overall hit ratio goes from ${pct(cdn0.hitRatio)} to ${pct(cdnFull.hitRatio)}. Then set the segment length to ${SEGMENT.min} s: the live delay falls from ${liveLatency(SEGMENT.initial)} s to ${liveLatency(SEGMENT.min)} s.`,
    `In "The ladder" (${l0.slow}% slow viewers) one rendition lets ${pct(ladders[0].share)} of viewers play, three ${pct(ladders[1].share)} and five ${pct(ladders[2].share)}, but the average bitrate rises from ${f2(ladders[0].avgBitrate)} to ${f2(ladders[1].avgBitrate)} to ${f2(ladders[2].avgBitrate)} Mbit/s and the storage from ${f2(ladders[0].storageGb)} to ${f2(ladders[2].storageGb)} GB. Set slow viewers to 100%: ${pct(laddersSlow[0].share)}, ${pct(laddersSlow[1].share)} and ${pct(laddersSlow[2].share)} can play.`,
  ],
  keyIdeas: [
    'Streaming is small files over plain HTTP: the video is cut into segments, each kept at several bitrates, and the player picks one per segment from its own measurements.',
    `The highest bitrate is not the best experience: on a steady 4 Mbit/s network a player that asks for the top rendition for each segment stalls on ${naiveSteady.stallCount} of ${naiveSteady.count} segments, because a segment that takes longer to download than to play drains the buffer.`,
    `Rate-based players follow the throughput they measured and buffer-based players follow how much video is queued. In this model, on the drop trace, the buffer-based one stalled ${f1(bufferDrop.stallTime)} s against ${f1(rateDrop.stallTime)} s, and paid for it in bitrate.`,
    `Because segments are ordinary cacheable files, a CDN serves popular titles from the edge: in the default cache scene the titles ranked ${LONG_TAIL_FROM} to ${CATALOGUE} are ${pct(longTail0.requests / cdn0.requests)} of the requests but ${pct(longTail0.originShare)} of the ones that reach the origin. More renditions serve better quality at a storage cost.`,
  ],
  quiz: [
    {
      q: 'What carries the video in HLS and DASH style streaming?',
      options: [
        'Plain HTTP requests for small files, one request per segment of video',
        'A dedicated streaming protocol that holds one connection and pushes the frames',
        'A mesh between the viewers, with the servers kept only for signalling',
        'UDP datagrams from the origin, which the player asks to be sent again',
      ],
      answer: 0,
      why: 'The player downloads each segment as an ordinary file over HTTP, which is why caches and CDNs work for video: nothing about a segment is special to the network.',
    },
    {
      q: `A viewer\'s network averages 4 Mbit/s and the player always asks for the 5 Mbit/s rendition, in ${SEGMENT.initial} s segments. What happens?`,
      options: [
        'Each segment takes longer to download than it plays, so the buffer drains and the video stalls',
        'The player switches itself down after the first segment, so the picture only gets blurrier',
        'The buffer fills faster than it drains, since the player downloads while it plays',
        'The CDN converts the segments to a lower bitrate on the way to the viewer',
      ],
      answer: 0,
      why: `A ${SEGMENT.initial} s segment of ${TOP} Mbit/s is ${TOP * SEGMENT.initial} megabits, which takes ${(TOP * SEGMENT.initial) / STEADY_RATE} s at ${STEADY_RATE} Mbit/s: ${(TOP * SEGMENT.initial) / STEADY_RATE - SEGMENT.initial} s longer than it plays. A fixed top rendition cannot adapt, so the shortfall repeats.`,
    },
    {
      q: 'What does a buffer-based player look at to choose the next rendition?',
      options: [
        'How many seconds of video it already holds, between a reservoir and a cushion',
        'The throughput measured on the last download, averaged over the recent past',
        'The size of the segment and the speed of the viewer\'s device, and nothing else',
        'The share of viewers who are watching the same title from the same cache',
      ],
      answer: 0,
      why: 'A buffer-based rule maps the buffer level to a bitrate: low buffer, low bitrate; a full buffer, the top. Looking at the last download\'s throughput is the rate-based rule.',
    },
    {
      q: 'Why does a CDN cache help video delivery so much?',
      options: [
        'Segments are ordinary files, so popular ones are served from the edge and few requests reach the origin',
        'The CDN transcodes every segment to the bitrate that the viewer\'s network can sustain at that moment',
        'The CDN keeps one long connection per viewer back to the origin and relays the video through it',
        'The CDN rewrites the manifest so that the players choose a lower quality and need less data',
      ],
      answer: 0,
      why: 'A cache needs repeatable requests for the same bytes, and segments are exactly that. Popular titles hit on the great bulk of their requests; long-tail titles still reach the origin.',
    },
    {
      q: `A live stream has ${LIVE_QUIZ_SEGMENT} s segments, the player holds back ${LIVE.segmentsBuffered} of them, and it takes ${LIVE.pipelineSeconds} s to encode and deliver a segment. About how far behind real time is the viewer?`,
      options: [`${liveLatency(LIVE_QUIZ_SEGMENT)} s`, `${LIVE.segmentsBuffered * LIVE_QUIZ_SEGMENT} s`, `${LIVE_QUIZ_SEGMENT + LIVE.pipelineSeconds} s`, `${LIVE_QUIZ_SEGMENT} s`],
      answer: 0,
      why: `${LIVE.segmentsBuffered} segments x ${LIVE_QUIZ_SEGMENT} s = ${LIVE.segmentsBuffered * LIVE_QUIZ_SEGMENT} s held back, plus ${LIVE.pipelineSeconds} s of encoding and delivery makes ${liveLatency(LIVE_QUIZ_SEGMENT)} s. Shorter segments, or partial segments, cut this.`,
    },
  ],
};

export default lesson;
