import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A game loop updates the world, renders it and repeats. Stepping the physics by a fixed dt, with an accumulator to soak up uneven frames, keeps it stable and identical at any frame rate.',
    what: 'requestAnimationFrame calls you once per display refresh, and frames are never quite even. Variable dt (position += velocity × frame time) adapts to that, but a long frame is one long jump, so a fast ball can tunnel through a thin wall, and machines with different frame rates compute slightly different physics. The fixed-step pattern (Glenn Fiedler\'s "Fix Your Timestep!") adds each frame\'s time to an accumulator, runs physics in steps of exactly dt while there\'s enough, and carries the remainder; rendering can blend the last two states by alpha = accumulator / dt. If updates cost more real time than they simulate, the backlog grows every frame (the spiral of death), so loops cap the frame time and accept slow motion instead. It\'s the same one-thread problem as in `event-loop`: work that blocks the thread delays everything after it.',
    analogy: 'A dance and a strobe light. The dancers move to a fixed beat whatever the strobe does; a slow strobe shows bigger jumps between poses, but the dance itself is the same. Variable dt is letting the strobe set the beat.',
    useCases: [
      'Game engines: Unity\'s FixedUpdate and Godot\'s physics process run physics on a fixed step, apart from rendering',
      'Multiplayer and replays: lockstep and rollback netcode need every machine to compute the same steps (fixed steps, plus deterministic maths and inputs)',
      'Canvas and WebGL animation on the web, driven by requestAnimationFrame',
      'UI physics and simulations: springs, scroll momentum, particle effects that must not explode on a slow frame',
    ],
    why: 'Frame-rate bugs are classic: physics that changes on a fast monitor, characters falling through floors after a hitch, replays that drift out of sync, and games that freeze after one slow frame. Knowing the accumulator pattern and the frame-time cap fixes the frame-rate half of each of them (replays and netcode also need deterministic maths and inputs), and it shows up in interviews for game, graphics and simulation work.',
    watch: 'One real loop: the ball is blue and the thin wall violet inside a dark box; a tunnelling event flashes the box red with a "tunnelled through the wall" label. With interpolation, a dim grey outline marks the newest physics step that the drawn ball trails. In the frame-budget bar, update time is yellow and render time green against a dim grey 16.7 ms track; the bar gets a red outline (and its "over the budget" note turns red) when update plus render take more than 16.7 ms, and the frame-time line and stat turn red when a frame misses a 60 Hz frame, taking over 20.8 ms. The frame-time history is a blue sparkline with a dashed line at 16.7 ms, and updates per frame a yellow one. The tunnels stat is green at 0 and red above it; the updates stat turns red at the safety stop. Two machines: each simulated display shows the blue ball with a faint blue trail and the violet wall; with fixed steps the gap stat is green at exactly 0 and red otherwise.',
  },
  tryThis: [
    'Press "Tunnelling preset" and wait a few seconds: the 250 ms spike lands as the ball nears the wall, and the ball comes out the other side.',
    'Switch the loop to "fixed step" with the same spike: no tunnel, but "updates this frame" jumps as the loop catches up.',
    'On a fixed step, set "Update cost" to 20 ms and "Max frame time" to none: updates per frame climb to the safety stop. Then turn the cap back on.',
    'Open "Two machines": under variable dt the 30 Hz and 144 Hz balls drift apart; switch to "fixed step" and the gap stays exactly 0.',
    'Look at the rAF rate stat: it shows your own display\'s refresh rate, which differs from device to device.',
  ],
  keyIdeas: [
    'Variable dt makes physics depend on the frame rate: long frames mean long jumps, and tunnelling.',
    'A fixed step with an accumulator runs physics in exact dt slices and carries the remainder to the next frame.',
    'Render interpolation blends the last two states by alpha = accumulator / dt, so motion stays smooth at any refresh rate.',
    'Cap the frame time: if updates cost more than they simulate, the backlog spirals; capped, the game just slows down.',
  ],
  quiz: [
    {
      q: 'A physics game moves things by velocity × frame time. One player has a 144 Hz monitor, another a 30 Hz one. What happens?',
      options: [
        'Their physics differs, and long frames can tunnel',
        'Both see identical physics, just smoother at 144 Hz',
        'The 144 Hz game runs about five times faster',
        'The 30 Hz player\'s ball moves at half the speed',
      ],
      answer: 0,
      why: 'Multiplying by frame time keeps speeds right on average, so neither game runs faster or slower. But gravity and collisions depend on the step size, so the trajectories drift apart, and a long frame can carry the ball past a thin wall. "Identical, just smoother" is the tempting half-truth: smoother, yes; identical, only with a fixed step.',
    },
    {
      q: 'In a fixed-step loop with dt = 1/60 s (16.7 ms), a frame took 40 ms and the accumulator already held 5 ms. What happens?',
      options: [
        '2 updates, and about 11.7 ms carried over',
        '3 updates, rounding the 45 ms up to 50 ms',
        '2 updates, and the extra 11.7 ms is dropped',
        '1 update, using one long 40 ms step',
      ],
      answer: 0,
      why: '40 + 5 = 45 ms. Two whole 16.7 ms steps fit (33.3 ms), leaving 11.7 ms in the accumulator for the next frame. Dropping that leftover would make the game run slow; only the max-frame-time cap throws time away. One 40 ms step is what variable dt would do.',
    },
    {
      q: 'What is alpha in fixed-step render interpolation?',
      options: [
        'Accumulator ÷ dt: how far between two states',
        'The fraction of the frame budget left after update',
        'The transparency used to draw the previous frame',
        'The ratio of the display rate to the physics rate',
      ],
      answer: 0,
      why: 'alpha = accumulator / dt, in [0, 1): how much time has passed beyond the newest physics state, as a fraction of a step. The renderer blends the previous and newest states by it. Despite the name it has nothing to do with transparency.',
    },
    {
      q: 'Each update takes 20 ms of real time to simulate 16.7 ms, and nothing caps the frame time. What happens?',
      options: [
        'Each frame owes more updates: a spiral of death',
        'The loop settles at two updates every frame',
        'The game runs fine, just with a lower frame rate',
        'The accumulator goes negative and stops updating',
      ],
      answer: 0,
      why: 'Every update adds more real time than it simulates, so the next frame starts further behind and needs even more updates. It never settles, because the debt grows every frame. Capping the frame time (Fiedler\'s article uses 250 ms) turns it into slow motion instead.',
    },
    {
      q: 'Why can a fixed step of 1/60 s never carry this lesson\'s ball through the thin wall?',
      options: [
        'One step moves 5 units; crossing the wall takes 20',
        'Fixed steps check collisions along the whole path',
        'The accumulator slows the ball before the wall',
        'Fixed steps run on a separate, faster thread',
      ],
      answer: 0,
      why: 'The collision check only looks where the ball ends up. At 300 units/s a 1/60 s step moves 5 units, but getting past the zone where the ball touches the wall (8 + 2 on each side, 20 in all) takes more, so some step always lands inside it. Checking the whole path (continuous collision detection) is a different fix, used for very fast objects.',
    },
  ],
};

export default lesson;
