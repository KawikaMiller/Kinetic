import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Feed a gate\'s output back into its input and the circuit remembers. Latches and flip-flops store bits, and a clock decides when they take in new ones.',
    what: 'Every circuit so far forgot its output as soon as the inputs changed. Wire two NOR gates so each one\'s output feeds the other and you get an SR latch: pulse S and it remembers 1, pulse R and it remembers 0. A D latch stores whatever D is while the clock is high (it is transparent) and holds while it is low. A D flip-flop is edge-triggered: it samples D only at the instant the clock rises, so wiggles in between can\'t get through. Put four flip-flops on one clock and you have a register; feed the register through a +1 adder back into itself and it counts. The clock must be slow enough for the adder to finish between edges.',
    analogy: 'A latch is a window left open while the clock is high: anything that flies past gets in. A flip-flop is a camera that snaps one photo each time the clock rises: whatever happens between shots is never recorded.',
    useCases: [
      'CPU registers and pipeline stages, each a row of flip-flops on the clock',
      'Counters and timers in every microcontroller',
      'Debouncing a noisy button with a flip-flop sampled on a clock',
      'The maximum clock speed of a chip, set by its slowest path between flip-flops',
    ],
    why: 'This is where hardware gets state, the thing every program relies on. It also explains why CPUs have a clock speed at all, why overclocking eventually gives wrong answers, and why "edge-triggered vs level-triggered" shows up again in interrupts and event systems.',
    watch: 'Wires and waveforms that are 1 are yellow, 0 is dim. In "SR latch" the Q lamp has a violet ring because it is the stored value; truth-table rows with no valid answer (S = R = 1, and releasing both from there) are red; in the invalid state both lamps get red rings, and after releasing both at once the lamps show "?" and the loop wires go red and dashed. In "Latch vs flip-flop" the CLK and D lanes are yellow when high and dim when low, the two Q lanes are violet (stored values), and every rising clock edge, where the flip-flop captures, is a dashed blue line. In "Register & counter" the register\'s stored 1s are violet, the adder\'s output is yellow, adder bits that won\'t settle before the next edge are ringed red, and a wrong capture shows its bad bits in red next to the value it should have been, in green. The captures so far are listed as chips: violet when right, red when wrong.',
  },
  tryThis: [
    'In "SR latch", turn S on, then off: Q stays 1. Do the same with R.',
    'Turn S and R both on (the red row), then click the 0 0 row to release both together: unpredictable.',
    'In "Latch vs flip-flop", press "Glitch preset": the latch\'s Q dips with D, the flip-flop\'s doesn\'t.',
    'Pause, then toggle D while CLK is high and step: the latch reacts at once, the flip-flop waits for the edge.',
    'In "Register & counter", run it, then drag the clock period down to 1 tick and watch it count wrong.',
  ],
  keyIdeas: [
    'Feedback is memory: two cross-coupled NOR gates hold a bit after the inputs return to 0.',
    'A D latch is level-sensitive (transparent while the clock is high); a D flip-flop is edge-triggered (samples D only at the rising edge).',
    'A register is flip-flops sharing one clock; a counter feeds the register through a +1 adder back into itself.',
    'The clock period must exceed the slowest logic path between flip-flops, or the wrong value is captured.',
  ],
  quiz: [
    {
      q: 'D glitches to 0 and back while CLK is high, then stays 1 through the next rising edge. What happens to each Q?',
      options: [
        'The latch shows the glitch; the flip-flop never does',
        'The flip-flop shows the glitch; the latch never does',
        'Both show it, since a latch and flip-flop are the same',
        'Neither does, because CLK is high during the glitch',
      ],
      answer: 0,
      why: 'While CLK is high the latch is transparent, so its Q follows D down and back up. The flip-flop only looks at D at the rising edge, and D is 1 both times, so its Q never moves. That difference is the whole point of edge triggering.',
    },
    {
      q: 'In a NOR SR latch, why is S = R = 1 called invalid?',
      options: [
        'Q and Q̄ both go to 0, so they aren\'t opposites',
        'It burns out both NOR gates in the latch for good',
        'Q flips to its opposite value on every clock tick',
        'The latch ignores both inputs and simply holds',
      ],
      answer: 0,
      why: 'Each NOR gate sees a 1 on its outside input, so both outputs go to 0 and Q̄ is no longer NOT Q. Nothing is damaged, but releasing both at once leaves the latch in an unpredictable state.',
    },
    {
      q: 'What makes the counter capture a wrong value?',
      options: [
        'An edge arrives before the +1 adder has settled',
        'The register has only four flip-flops to work with',
        'The counter reaches 15 and has to wrap to zero',
        'D changes while the clock is still low in between',
      ],
      answer: 0,
      why: 'Each edge captures whatever the adder is outputting. If the period is shorter than the adder\'s settle time, some bits still show the old value. Wrapping from 15 to 0 is correct counting, not an error.',
    },
    {
      q: 'When can a D flip-flop\'s Q change?',
      options: ['Only at a rising clock edge', 'Whenever D changes', 'Any time while the clock is high', 'Whenever the clock is low'],
      answer: 0,
      why: 'Edge-triggered means it samples D at the instant the clock goes from 0 to 1 and holds that until the next rising edge. Following D whenever the clock is high is what a latch does.',
    },
  ],
};

export default lesson;
