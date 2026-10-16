import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Training is a loop over a dataset that cares about total work and can pause; serving answers one request at a time against a deadline, where batching trades waiting for capacity, and the same weights can serve worse than they evaluated.',
    what: 'Training repeats forward, loss, backward and update over minibatches until the loss is low enough, so its cost is total work over the data and a pause only delays it. Serving runs a single forward pass per request and is judged by time per request: p50 and p99 against a budget. Training needs several times the memory of inference because gradients and optimizer state sit next to the weights. A server can batch requests so its fixed per-batch cost is shared, which raises capacity but makes requests wait; past capacity the queue grows without bound (see the queueing-theory lesson, and percentiles-statistics for p50 and p99). Preprocessing that differs between training and serving, and failures during a long training job, are the two systems problems this lesson also simulates.',
    analogy: 'Training is a factory running a long shift: it matters how much it makes by the end, and a short stoppage only pushes the end back. Serving is a restaurant at lunchtime: every customer is waiting, so a short stoppage is a row of unhappy people, and cooking in bigger batches saves effort but makes the first order wait.',
    useCases: [
      'Sizing the hardware for a training job against the one for serving the same model',
      'Choosing a batch size and a max wait for a model server, and reading its p99 against a latency budget',
      'Explaining why a model that evaluated well gives worse answers in production',
      'Choosing how often a long training job writes a checkpoint',
    ],
    why: 'Most of the cost and many of the outages of an ML system are in the systems around the model: memory that does not fit, a queue that grows, a preprocessing step that differs, a job that loses a day to a failure. The arithmetic here (bytes per parameter, capacity of a batch, the Young/Daly estimate) lets you check such claims instead of trusting a vendor or a hunch.',
    watch: 'Training steps and the loss curve are blue. For serving, a request or a p99 inside the latency budget is green and one over it is red; in the Gantt chart, waiting in the queue is violet and hatched and service on the server is blue and solid, and a growing backlog is red. The memory bar splits into weights (sky), gradients (amber) and master weights and optimizer state (orange), plain categories rather than verdicts. In the checkpoint plot the simulated minimum is green, the classical estimate violet and your interval yellow.',
  },
  tryThis: [
    'In Two loops press play to the end (4 s): training reaches step 34 of 80 at 69.4 samples per second, and serving has 0 requests over 100 ms. Set "The machine" to freeze from 1 s to 2 s and play again: training reaches step 26, and 31 requests end up over 100 ms.',
    'In Memory and compute (1 billion parameters, training) the memory reads 16.0 GB; switch to Inference: 2.0 GB, and the training / inference ratio stays 8x. Drag Parameters to 7 billion in Training: 112 GB, which does not fit the 80 GB device.',
    'In Dynamic batching (120 requests per second, B = 8, T = 10 ms) p99 is about 65 ms, inside the 100 ms budget. Set Max batch to 1: "Overloaded: the queue is growing", and the sweep shows B = 4 is the smallest that keeps up. Then set Max batch to 2, Max wait T to 50 ms and Arrival rate to 40/s and drag Max batch from 2 to 8: p99 rises from 72 to 80 ms and p50 from 33 to 66 ms while throughput stays at about 42/s. More B bought capacity, not throughput, and the timer made requests wait.',
    'In Train-serve skew the served accuracy equals the 92.8% offline evaluation. Pick "Missing": 50%. Pick "Other statistics": 73%. The weights never changed.',
    'In Checkpoints (M = 3,600 s, C = 30 s) the simulated best interval is 400 steps (11,380 s) beside the estimate of 465 steps. Set M to 600 s and the interval to 1,000: the warning says a cycle usually fails before it finishes.',
  ],
  keyIdeas: [
    'Training optimises total work over a dataset and a pause just delays it; serving optimises time per request, and a pause shows up as late answers.',
    'Training state needs several times the memory of inference for the same parameters: about 16 bytes against 2 per parameter (from memory, verify), before activations.',
    'Batching raises capacity from B / (a + c B), but a batch goes at B requests or after the max wait T, so a long T makes requests wait; while the server keeps up, throughput is just the arrival rate whatever B is, and when arrivals outpace capacity the queue grows without bound.',
    'In this toy, the same weights score worse when serving preprocessing differs from training, and a checkpoint interval has a U-shaped cost: checkpoint too often or too rarely and the job takes longer.',
  ],
  quiz: [
    {
      q: 'Which statement best contrasts training and serving?',
      options: [
        'Training is judged on total work and can pause; serving is judged on time per request',
        'Training is judged on time per request and serving on the total work it does overall',
        'Both are judged on throughput, so the same hardware and settings suit each of them',
        'Training needs a deadline for every step, and serving can queue requests for as long as it likes',
      ],
      answer: 0,
      why: 'A training run finishes when the dataset has been processed enough, so a stall delays the end and changes nothing the steps compute. A request has a caller waiting, so a stall of the same length is a run of late answers. The two want different hardware settings.',
    },
    {
      q: 'A server keeps up with 40 requests per second and waits at most 50 ms to fill a batch. Its max batch size is raised from 2 to 8. What does that do?',
      options: [
        'It raises capacity and adds waiting while a batch fills, with throughput staying at the arrival rate',
        'It lowers latency for every request, because the fixed cost is shared by more of them',
        'It lowers capacity, because a bigger batch takes longer for the server to run',
        'It changes neither capacity nor latency, as long as the server keeps up',
      ],
      answer: 0,
      why: 'Capacity is B / (a + c B), which grows with B, but a server that already keeps up delivers throughput equal to the arrival rate whatever B is. With 40 requests per second and a 50 ms timer a batch of 8 usually waits for the timer, so p50 goes from 33 to 66 ms and p99 from 72 to 80 ms. A short timer would hide the wait.',
    },
    {
      q: 'A model has 1 billion parameters. About how much memory does mixed-precision Adam training state need, in decimal gigabytes, before activations?',
      options: ['16 GB', '2 GB', '4 GB', '8 GB'],
      answer: 0,
      why: 'Counting 2 bytes of half-precision weights, 2 of gradients and 12 of full-precision master weights and two Adam moments gives 16 bytes per parameter, so 16 GB; half-precision weights alone are 2 GB. The 16 comes from the ZeRO paper (from memory, verify).',
    },
    {
      q: 'A classifier scores 93% offline and 50% in production, with the same trained weights. Which cause fits the lesson\'s toy?',
      options: [
        'The standardisation applied in training is missing or different when serving',
        'The weights changed when the model was copied from the training machine',
        'The classifier forgot some of what it learned during the time it spent deployed',
        'The production machine is slower, so it computes less accurate predictions',
      ],
      answer: 0,
      why: 'Identical weights see different inputs when the pipeline differs: in the toy, skipping the standardisation gives 50% and rescaling with other statistics gives 73%, while the matching pipeline reproduces 92.8% exactly. Speed does not change a prediction.',
    },
  ],
};

export default lesson;
