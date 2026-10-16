import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A neural network is a stack of simple functions, and backpropagation is the bookkeeping that hands every weight its share of the blame in one backward pass; gradient descent then takes the step.',
    what: 'One neuron computes p = σ(w1·x1 + w2·x2 + b), which can only draw a straight line, so it cannot separate XOR. Hidden units re-describe the inputs so a line can finish the job. To train, the network needs the slope of the loss with respect to every weight: backpropagation applies the chain rule from the output back to the input, reusing the numbers from the forward pass, so all gradients cost about one extra pass. Gradient descent is unchanged from before: it steps each weight against its gradient. Everything here is a toy trained live in your browser.',
    analogy: 'A relay team that misses its time: the coach starts at the finish line and asks each runner in turn how much of the gap was theirs, passing the question back along the baton route instead of re-running the race once per runner.',
    useCases: [
      'Training every deep-learning model: the framework builds the backward pass from the forward code',
      'Debugging a loss that stalls or goes NaN by reading gradient norms and the learning rate',
      'Checking a hand-written layer against finite differences before trusting it',
      'Explaining why a model needs hidden layers at all, not just more inputs',
    ],
    why: 'Almost every ML failure report ("the loss is stuck", "it diverged", "one seed works and another does not") comes back to gradients and initial weights. Knowing what backprop computes, what it costs and how to test it turns those reports from mysteries into things you can measure.',
    watch: 'Points are two plain categories: class 0 orange and class 1 sky, and the shaded plane shows which class the network would pick, stronger where it is surer; a red ring marks a point on the wrong side. In the network diagram the input being propagated is yellow, forward values are blue, and error signals going right to left are violet; an edge is as thick as its |weight| or |gradient| and dashed when negative. A loss that fell is green, one that rose or diverged is red, and a dead unit or a stopped run is grey or red. The curves are blue; the violet bars are gradient norms.',
  },
  tryThis: [
    'In One neuron (two blobs) the default weights get 30% right. Press "Fit: 100 gradient-descent steps": the line swings between the blobs and accuracy reaches 100%. Switch to XOR and press Fit: the loss stalls near 0.69 and accuracy stays at 50%.',
    'In Forward pass (the hand-built XOR network, corner (1, 1) selected) the hidden units read 2 and 1 and the output is 0. Press corner (0, 1): the hidden units read 1 and 0 and the output is 1.',
    'In Backward pass, switch "Backward pass" to "Break it: drop the slope f′": gradCheck goes from passes to fails, and the training table shows the broken run ending at the loss ln 2 = 0.693 while the correct run falls far below it.',
    'In Train it (XOR, 3 tanh units) press Step 100 three times: accuracy reaches 95%. Set Units per layer to 1 and press "Run 20 seeds": none reach 100%. Set it back to 3: 18 of 20 do.',
    'In Train it, pick ReLU, drag the learning rate to its top (10) and set momentum to 0.5, then press Play: the run stops with "diverged at epoch 5" instead of plotting a loss that blew up.',
  ],
  keyIdeas: [
    'Backpropagation computes the gradient of each weight with one forward and one backward pass; gradient descent, the same rule as before, takes the step.',
    'Hidden units re-describe the inputs so a line can finish the job: in this lesson, one neuron tops out at 75% on XOR and three hidden units can reach 100%.',
    'A wrong backward pass still runs; a numeric check (gradCheck, 2P forward passes) is what shows it is not the gradient of the loss.',
    'In this toy, whether training works depends on the seed, the learning rate and the activation, and a network that fits its points has not understood anything.',
  ],
  quiz: [
    {
      q: 'How does backpropagation relate to gradient descent?',
      options: [
        'It computes every weight\'s gradient, and gradient descent then uses them to step',
        'It replaces gradient descent with a faster, learning-rate-free rule that needs a single forward pass',
        'It tries random weight changes and keeps whichever lowers the loss',
        'It updates the weights itself and uses gradient descent to score them',
      ],
      answer: 0,
      why: 'Backprop is the chain rule organised to reuse the forward numbers: it produces gradients. The update, w minus the learning rate times the gradient, is still plain gradient descent, so the learning rate still matters.',
    },
    {
      q: 'A network with one hidden unit is trained on XOR for thousands of epochs and its accuracy stalls at 75%. What is it actually doing?',
      options: [
        'Its output depends on one linear combination, so its boundary is still a straight line',
        'It needs more epochs and would reach 100% if it kept training for long enough',
        'It memorised three clusters and ignores the fourth, because that keeps the average loss lowest',
        'Its learning rate is too high, so the weights bounce between two good answers',
      ],
      answer: 0,
      why: 'With one hidden unit the output is a monotone function of w·x + b, so the decision region is a half-plane, and no half-plane gets more than 75% of XOR. More epochs cannot change the shape; more hidden units can.',
    },
    {
      q: 'A hand-written layer\'s gradCheck reports a huge relative error while training seems to run. What does it mean?',
      options: [
        'The layer\'s backward code does not compute the gradient of the loss',
        'The numeric gradient is unreliable here because the loss is already close to zero',
        'The learning rate is too large for the finite differences to track',
        'The layer has too many weights for central differences to cover',
      ],
      answer: 0,
      why: 'gradCheck compares the analytic gradient with central differences of the loss. A large gap means the analytic code is wrong; dropping the activation slope from the hidden errors is one way to get it. Training can still seem to move, which is why the check exists.',
    },
    {
      q: 'A network has 1,000,000 weights. What does one numeric gradient (central differences) cost compared with backprop?',
      options: [
        '2,000,000 forward passes, against one forward and one backward pass',
        '1,000,000 forward passes, against two million backward passes',
        'About the same: both need one pass per weight to find its slope',
        'Two forward passes in all, because the weights share one loss',
      ],
      answer: 0,
      why: 'Central differences move each weight up and down by ε and re-run the forward pass: 2P passes. Backprop reuses the forward numbers and needs one forward and one backward pass whatever P is, which is why nobody trains with numeric gradients.',
    },
  ],
};

export default lesson;
