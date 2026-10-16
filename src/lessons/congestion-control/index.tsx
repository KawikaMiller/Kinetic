import type { LessonModule } from '../../core/types';
import { pct } from '../../core/format';
import { seg } from './captions';
import { COMPARE_ROUNDS, DEFAULT_LOSS, DEFAULT_START, LOSS_ROUNDS, RENO_ROUNDS, initialCompare, initialLoss, initialReno } from './init';
import { RULE_LABEL, readTrajectory, trajectory } from './fairness';
import { DEFAULT_LINK, bdpOf, bufferOf, mathisWindow, renoMeanWindow, simulate, summarise, thresholdOf, type Algo } from './model';
import { Stage } from './Stage';

const link = initialReno();
const reno = simulate('reno', link, RENO_ROUNDS);
const losses = reno.filter((r) => r.event);
const first = losses[0];
const second = losses[1];
const timeoutRun = simulate('reno', { ...link, timeouts: true }, RENO_ROUNDS);
const used = (algo: Algo, bufferBdp: number) => summarise(simulate(algo, { ...initialCompare(), bufferBdp }, COMPARE_ROUNDS));
const shallow = { reno: used('reno', 0.1), bbr: used('bbr', 0.1) };
const deep = { reno: used('reno', 2), bbr: used('bbr', 2) };
const fair = (rule: 'aimd' | 'aiad' | 'miad') => readTrajectory(trajectory(DEFAULT_START, rule));
const lossLink = initialLoss();
const lossSim = renoMeanWindow(lossLink.loss, LOSS_ROUNDS, lossLink.seed, thresholdOf(lossLink));
const lossFree = renoMeanWindow(0, LOSS_ROUNDS, lossLink.seed, thresholdOf(lossLink));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A TCP sender cannot see the network, so it probes: it grows its window until something is lost, then backs off. Reno halves, CUBIC bends back toward its old peak, and BBR measures the pipe instead.',
    what: 'The receiver says how much it can take; the network says nothing, so the sender infers a limit from loss and delay. Reno starts small, doubles its window every round trip (slow start), then adds one segment a round (congestion avoidance) until the bottleneck buffer overflows. A loss signalled by duplicate ACKs halves the window; a timeout restarts it from one. CUBIC regrows along a cubic curve toward the window where it last lost. BBR estimates the bottleneck rate and the base round trip and paces to them, so it ignores loss and keeps the queue short. Adding one and cutting by a fraction, AIMD, is the rule that drives competing flows toward equal shares. A segment lost by chance, with no congestion, still halves the window.',
    analogy: 'Pouring water into a pipe you cannot see into. You keep pouring faster until it splashes back, then cut the flow in half and slowly speed up again. A wide, long pipe holds a lot of water in flight before any comes out the far end.',
    useCases: [
      'Explaining why a download starts slowly and then speeds up',
      'Reading why a big buffer on a home router makes video calls lag while a download runs (bufferbloat)',
      'Choosing between loss-based and model-based congestion control for a long, fat or lossy path',
      'Seeing why a lossy wireless link starves a TCP flow that the link could carry',
    ],
    why: 'Almost every network performance complaint ends up at the window: too small for a long fat pipe, collapsed by chance loss, or filling a buffer until latency balloons. Knowing what the sender is reacting to tells you which knob, the buffer, the algorithm or the loss, actually matters.',
    watch:
      'Reno and the comparison: yellow is the window (or BBR\'s sending rate), blue the queue in the buffer, green the pipe (BDP), a red dashed line the size at which the buffer overflows and a red dashed tick a loss, an orange tick a timeout. Tints along the x axis are plain categories: amber for slow start or BBR startup, sky for congestion avoidance or BBR ProbeBW, pink for BBR drain. Fairness: yellow is the path of the two rates, blue the start you can drag, a solid violet line means the link is exactly full and a dashed one means equal shares. Random loss: yellow is the simulated mean window, grey dashed the Mathis relation, a red line the loss rate you set. The chips say what is simulated, illustrative, a toy or from memory.',
  },
  tryThis: [
    `In "Reno" (${link.mbps} Mbit/s, ${link.rttMs} ms, buffer ${link.bufferBdp} BDP, so BDP ${seg(bdpOf(link))} and ${bufferOf(link)} segments of buffer) press play: the window doubles ${reno.slice(0, 5).map((r) => seg(r.sent)).join(', ')}; at round ${first.round} it is above ${thresholdOf(link)}, ${seg(first.overflow)} segments are lost and it halves to ${seg(reno[first.round + 1].sent)}; it then adds one a round until round ${second.round} and halves to ${seg(reno[second.round + 1].sent)}.`,
    `From the Reno defaults set "Loss reaction" to "timeout (whole window lost)": the first loss at round ${first.round} drops the window to ${seg(timeoutRun[first.round + 1].sent)} instead of ${seg(reno[first.round + 1].sent)} and slow start begins again, so ${pct(summarise(timeoutRun).meanUtil)} of the link is used on average against ${pct(summarise(reno).meanUtil)}.`,
    `In "Three algorithms" set the buffer to 0.1 BDP: Reno uses ${pct(shallow.reno.meanUtil)} of the link and BBR ${pct(shallow.bbr.meanUtil)}. Set it to 2.0 BDP: Reno's round trip averages ${Math.round(deep.reno.meanRttMs)} ms and BBR's ${Math.round(deep.bbr.meanRttMs)} ms, from a ${DEFAULT_LINK.rttMs} ms base.`,
    `In "Fairness" the start (20, 60) under AIMD narrows the gap from ${seg(fair('aimd').startGap)} to ${seg(fair('aimd').endGap)}. Pick ${RULE_LABEL.aiad}: the gap stays ${seg(fair('aiad').endGap)}. Pick ${RULE_LABEL.miad}: it widens to ${seg(fair('miad').endGap)}.`,
    `In "Random loss" (${pct(DEFAULT_LOSS, 2)} loss) Reno's mean window is ${seg(lossSim)} segments, the Mathis relation says ${seg(mathisWindow(DEFAULT_LOSS))}, and the link is ${pct(Math.min(1, lossSim / bdpOf(lossLink)))} used, against ${pct(Math.min(1, lossFree / bdpOf(lossLink)))} with no random loss.`,
  ],
  keyIdeas: [
    'The sender infers the network\'s limit from loss and delay: congestion control is the sender\'s job, and flow control, the receiver\'s window, only protects the receiver\'s own buffer.',
    'In this model Reno doubles its window each round trip in slow start, adds one a round afterwards, and halves it on a loss; the window peaks where the pipe plus the buffer overflows, so a deep buffer shows up as round-trip delay.',
    'A lost segment is not always congestion: in this model a chance loss halves Reno\'s window just as an overflow does, so the mean window falls roughly as one over the square root of the loss rate.',
    'Additive increase with multiplicative decrease narrows the gap between two competing flows at every decrease, while additive decrease keeps it and multiplicative increase can widen it.',
  ],
  quiz: [
    {
      q: 'A TCP sender transmits faster than the network can carry. Who decides how fast it may send?',
      options: [
        'The receiver, which advertises how much data the network can carry',
        'The sender, which infers the network\'s limit from loss and delay',
        'The bottleneck router, which tells each sender its fair share',
        'The application, which sets a rate before the connection opens',
      ],
      answer: 1,
      why: 'The receiver\'s window covers the receiver\'s own buffer, and routers do not tell senders a rate. The sender probes: it grows until a loss or a delay signals the limit, and backs off.',
    },
    {
      q: 'A link loses 1% of segments by chance and its buffer is nearly empty. What happens to a Reno flow on it?',
      options: [
        'It ignores the loss, because the link is not congested at the moment',
        'It speeds up, to make up for the segments that were lost on the way',
        'It halves its window at each loss and uses a small share of the link',
        'It waits until the buffer fills before it reacts to a loss on the path',
      ],
      answer: 2,
      why: 'Reno cannot tell a chance loss from an overflow, so each one halves the window. The average window then falls roughly as one over the square root of the loss rate, far below what the link could carry.',
    },
    {
      q: 'A path has 100 Mbit/s and a 200 ms round trip. Why is a window of 10 segments far too small?',
      options: [
        'The pipe holds about 1,700 segments of 1,500 bytes, so a window of 10 leaves it nearly empty',
        'The receiver would run out of buffer space after the first ten segments it gets',
        'Ten segments is below the smallest window that TCP allows on a long path',
        'The router would drop any window that is not a multiple of its queue size',
      ],
      answer: 0,
      why: 'The pipe holds a bandwidth-delay product of data in flight. A window of one BDP fills it and a smaller one leaves it idle, so more bandwidth does not mean more throughput unless the window grows with it.',
    },
    {
      q: 'Two flows share a link. Which pair of rules drives them toward equal shares of a full link?',
      options: [
        'Add when there is room and subtract when it is full',
        'Multiply when there is room and subtract when it is full',
        'Multiply when there is room and multiply down when it is full',
        'Add when there is room and multiply down when it is full',
      ],
      answer: 3,
      why: 'Each multiplicative decrease shrinks the gap between the flows by the same factor while an additive increase leaves it alone. Additive decrease keeps the gap, and multiplicative increase keeps the ratio or widens the gap.',
    },
    {
      q: 'The router buffer on a link is made much deeper. What does a Reno flow see?',
      options: [
        'A shorter round trip, because more packets can wait close to the sender',
        'The same round trip, because the window always stops growing at the pipe',
        'Fewer losses and a steady window, because the deeper buffer never fills up',
        'A longer round trip, because it keeps growing until the buffer is full',
      ],
      answer: 3,
      why: 'Reno grows until the buffer overflows, so a deep buffer fills before a loss tells it to stop, and every packet waits behind the queue. The extra delay is bufferbloat; BBR paces to the measured rate and keeps the queue short.',
    },
  ],
};

export default lesson;
