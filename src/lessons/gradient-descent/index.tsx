import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Gradient descent finds low points of a loss by repeatedly stepping against the slope, w ← w − η∇L, and the step size η decides whether it crawls, settles, zig-zags or blows up.',
    what: 'A model\'s loss is a surface over its parameters. The gradient ∇L points uphill, so each step moves a little downhill: η times the gradient. Too small and it takes forever; too big and it overshoots the valley, zig-zags, or diverges, because the safe step size depends on how sharply the surface curves (on a bowl, plain gradient descent diverges once η passes 2/λ, λ being the steepest curvature). Momentum keeps part of the previous move: it damps the zig-zag when steps are too big for a steep valley, and builds speed along a shallow floor. On a convex surface the minimum it finds is the minimum; on others it finds a local minimum, and where it starts decides which.',
    analogy: 'Walking down a foggy hill by feel: you can only sense the slope under your feet. Long strides get you down fast until one carries you across the valley and up the other side.',
    useCases: [
      'Training every neural network: backprop computes the gradient, an optimiser like SGD or Adam takes the step',
      'Fitting regressions and recommenders when the data is too big for a closed-form solve',
      'Tuning a learning rate: the loss curve shows crawling, oscillation or divergence',
      'Mini-batch SGD: cheap, noisy steps on a few examples instead of the whole dataset',
    ],
    why: 'Every "the loss went NaN" or "training is stuck" report comes back to step size, curvature and starting point. Reading a loss curve and knowing why a bigger learning rate made things worse is a daily skill for anyone touching ML code.',
    watch: 'The map is shaded in bands from dark grey (high loss) to blue (low loss). The yellow ball is the current position, with a thin yellow trail behind it and a hollow yellow ring at the start. The violet arrow is the next push −η∇L. A green dot marks the minimum found once a run converges; the step that diverged is a red line. The loss plot on the right draws the loss above the lowest possible, on a log scale, in yellow (its last point turns red on a divergent run).',
  },
  tryThis: [
    'On the round bowl, press the four learning-rate presets in turn: crawl, settle, zig-zag, blow up.',
    'Pick "Narrow ravine" and "Too big": it zig-zags across the ravine on every step. Raise β to 0.5: the swings die out sooner and it arrives in about a third of the steps.',
    'On "Two minima", click the map left of the middle, then right of it: the start decides which valley you get.',
    'On "Saddle", press "Start exactly on the ridge (w₂ = 0)": the run stops on the flat saddle and the caption says it is not a minimum.',
    'On "Line fit (MSE)", switch to mini-batches of 8: the path gets jittery, and "New batches" gives a different jitter.',
  ],
  keyIdeas: [
    'Each step moves −η·∇L: against the slope, scaled by the learning rate.',
    'Bigger η is not always faster: past about 2/λ it overshoots, oscillates and diverges.',
    'Momentum damps zig-zags and builds speed on shallow floors; mini-batches trade noise for cheap steps.',
    'A zero gradient means flat, not lowest: a minimum, a maximum or a saddle.',
  ],
  quiz: [
    {
      q: 'Training with η = 0.01 is slow, so you try η = 1. The loss bounces around and then shoots to NaN. What happened?',
      options: [
        'Each step overshot the valley by more than the last',
        'A bigger rate always converges faster, so it is a bug',
        'The gradient was computed with the wrong sign',
        'The loss surface changed shape when η changed',
      ],
      answer: 0,
      why: 'Past about 2/λ (λ the steepest curvature) every step jumps across the valley and lands higher than it started, so the loss grows until it overflows. The belief that a bigger rate is always faster is exactly the trap. The surface itself doesn\'t depend on η.',
    },
    {
      q: 'On a surface with two valleys, gradient descent settles in the shallower one. What decided that?',
      options: ['Which basin it started in', 'The learning rate alone', 'Which valley is wider', 'How many steps it took'],
      answer: 0,
      why: 'It only ever follows the local slope, so the basin it starts in is where it ends (for a sensible η). It cannot see a deeper valley over the ridge. A huge η can throw it across, but that\'s luck, not design.',
    },
    {
      q: 'In a long, narrow ravine plain gradient descent zig-zags between the walls. What does momentum change?',
      options: [
        'Its swings across the walls shrink, and it speeds along the floor',
        'It makes every step exactly perpendicular to the walls',
        'It lowers the learning rate automatically whenever walls get steep',
        'It removes the need for a learning rate altogether',
      ],
      answer: 0,
      why: 'Momentum adds β × the previous move: successive side-to-side parts point opposite ways and partly cancel, while the small, steady pull along the floor adds up (here, "Too big" on the ravine goes from 136 steps to 44 at β = 0.5). It doesn\'t change η; adaptive methods like Adam rescale steps, momentum alone doesn\'t.',
    },
    {
      q: 'The gradient is exactly zero at the point where a run stopped. What can you conclude?',
      options: [
        'Only that it is flat: a minimum, a maximum or a saddle',
        'It is the lowest point of the whole loss surface',
        'It must be a minimum, since descent only goes down',
        'The learning rate was set too small to move',
      ],
      answer: 0,
      why: 'Zero gradient means flat. It is the global minimum only on a convex surface; otherwise it may be a local minimum, a local maximum, or a saddle that curves down in some direction. Gradient descent heads downhill, but it can still stop exactly on a ridge or a peak if no push ever points off it. Checking the curvature (the Hessian) tells them apart, as this lesson does.',
    },
    {
      q: 'Why train on mini-batches of a few examples when full-batch gradients are less noisy?',
      options: [
        'Each step costs a small fraction of a full pass over the data',
        'Mini-batch gradients point exactly downhill on every single step',
        'Noise guarantees finding the global minimum on any surface',
        'Full-batch gradients cannot be computed for linear models',
      ],
      answer: 0,
      why: 'A batch of 8 out of 40 points costs a fifth of a full gradient (on large datasets, a tiny fraction), so you take many more steps for the same work. The price is noise: the batch gradient only estimates the true one, so the run jitters instead of settling.',
    },
  ],
};

export default lesson;
