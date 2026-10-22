import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Answering a prompt is one prefill that processes the whole prompt together, then a run of decode steps that each emit one token, and the KV cache and a scheduler that refills the batch after each step decide how many requests a device can serve.',
    what: 'Prefill does the arithmetic for the prompt tokens in a single pass, so it is limited by compute and sets the time to first token. Each decode step then produces one token by reading the weights and the stored keys and values of the earlier tokens, so it is limited by memory bandwidth, and a batch of sequences shares one read of the weights. The KV cache keeps those keys and values so a new token does not recompute the old ones; it grows with the context and with the batch, and it caps how many requests fit. Continuous batching refills a finished sequence\'s slot after any step instead of waiting for the longest request. This lesson runs a toy device with round, made-up numbers, not any real model or accelerator.',
    analogy: 'A kitchen reads a long order slip once (prefill), then plates one dish at a time (decode). Each plating trip walks to the pantry (the weights), so serving four tables on one trip is cheap. A waiter who seats a new table the moment one leaves keeps the kitchen busier than one who waits for the slowest table to finish.',
    useCases: [
      'Reading a serving dashboard that splits time to first token from time per output token',
      'Estimating how many concurrent requests a device\'s memory can hold once the weights and the cache are counted',
      'Choosing between a full multi-head model and a grouped-query one when cache memory is the limit',
      'Explaining why a server with spare compute still builds a queue',
    ],
    why: 'Much of the cost of serving a language model is memory traffic, not arithmetic: the weights read at each step, the cache that grows per token, and the slots a batch can fill. The formulas here (bytes per token, one weight read shared by a batch, a regime read from the larger of two terms) let you sanity-check a capacity plan or a vendor claim instead of trusting it.',
    watch: 'Prefill is yellow, the burst happening now, and decode steps are blue. In the memory bar the weights are sky blue, cache in use is grey and free memory is green; a cache that does not fit turns red. In the cache grid each request has its own colour and an empty outlined cell is set aside but unused. In the slot chart a hatched grey bar is an idle slot held until its batch ends, and the red line is the queue of waiting requests.',
  },
  tryThis: [
    'In One request (1,000 prompt tokens, 200 output tokens) the time to first token is 20.00 ms (compute-bound), each later token takes about 2.03 ms (memory-bound), the total is about 423 ms, and prefill handles 83.3% of the tokens in 4.7% of the time. Set the prompt to 100 tokens and read "balanced: the two terms are equal".',
    'In The KV cache (toy-24, 2,048 tokens, a batch of 16) each request holds 50.3 MB and 437 fit. Set the batch to 438 and read "the 438th request waits". Then choose full multi-head and the fit count falls to 109.',
    'In The KV cache set the sequence to 600 tokens and choose reserve 4,096 each: 218 fit. Choose 16-token blocks: 1,472 fit. Then switch the cache to "forgets the new values" and read that the output first differs at step 2.',
    'In Batching (continuous, 20 requests per second, seed 1) the run reaches about 2,719 output tokens per second with a time to first token of 13 ms at p50. Choose static: about 1,721 tokens per second and a p50 near 6.7 s, with hatched idle slots in the chart.',
    'In Batching reserve 4,096 tokens for every request, set Max sequences to 64, memory to 8 GB and requests per second to 60: the queue caption says the cache held the queue head back on 2,294 of 5,632 iterations.',
  ],
  keyIdeas: [
    'Prefill reads the prompt in one pass and is limited by compute; each decode step reads the weights and the cache for one new token and is limited by memory, which is why in this toy the first token takes 20 ms and later ones about 2 ms.',
    'The KV cache stores earlier tokens\' keys and values, so decoding one more token is not a recompute of the prompt (the page checks the two agree to 1e-9); it costs 2 x layers x KV heads x head dim x bytes per token, which in this toy caps a 24 GB device at 437 requests of 2,048 tokens.',
    'One read of the weights serves each sequence in a decode batch: in this toy a step for 64 sequences takes 1.76 times as long as one for 1 and gives 36 times the tokens per second. The a + c b shape of the batch-or-wait lesson survives per step, paid per token instead of per request.',
    'On these seeded workloads continuous batching is not worse than static batching on throughput and is far ahead at 20 requests per second, because a static batch holds each slot until its longest request ends; the numbers are a toy device\'s, not any server\'s.',
  ],
  quiz: [
    {
      q: 'Why does generating each new token not need the keys and values of the whole prompt recomputed?',
      options: [
        'Earlier tokens keep the same keys and values under causal attention, so they are stored and a new token adds one pair',
        'The model memorises the prompt in its weights during the first step, so later steps do not read it again',
        'Attention skips the earlier tokens after the first step, so only the newest token is looked at by the model',
        'The prompt is read from disk at each step, but the operating system keeps that file in its own cache',
      ],
      answer: 0,
      why: 'Under causal attention a token\'s keys and values depend on the tokens before it, so they stay fixed once computed. Storing them is the cache. The page checks that cached decoding equals recomputing from scratch to 1e-9, and that a cache which forgets a value diverges at step 2.',
    },
    {
      q: 'A request has 1,000 prompt tokens and 200 output tokens. Which phase takes most of the time on the toy device?',
      options: [
        'Decode, because each step reads the weights while prefill handles its tokens together',
        'Prefill, because it has 1,000 tokens to process and decode has far fewer tokens to produce',
        'They take about equal time, because both phases do the same arithmetic for each token in them',
        'Neither does, because the cache removes the work of both phases once a prompt has been seen',
      ],
      answer: 0,
      why: 'Prefill is 20 ms, compute-bound and shared across the prompt; decode is 199 steps of about 2 ms each, about 403 ms. Prefill has 83% of the tokens and under 5% of the time.',
    },
    {
      q: 'With 1,000 tokens of context per sequence, raising the decode batch from 1 to 64 raises the step time from 2.02 ms to 3.57 ms. What follows?',
      options: [
        'Throughput rises about 36 times, since the weights are read once for the whole batch',
        'Time per token rises 64 times, since each sequence waits behind the 63 others in its batch',
        'Throughput rises about 1.76 times, the same factor as the step time grew by in this change',
        'Nothing changes, since the device is already running at full speed with a batch of one',
      ],
      answer: 0,
      why: 'A step costs about a + c b with a = 2 ms (the weight read) and c about 0.025 ms (each sequence\'s cache read). Sixty-four sequences emit 64 tokens in 3.57 ms: 17,913 tokens per second against 494.',
    },
    {
      q: 'What does continuous batching do that the batch-or-wait model of the training-vs-inference lesson cannot?',
      options: [
        'It refills a finished sequence\'s slot after any token step, not when the longest ends',
        'It makes each request cheaper by shrinking the weights that every one of its steps has to read',
        'It lets one server batch together requests that are addressed to several different models',
        'It removes the prefill phase, because the batch always has a sequence ready to decode next',
      ],
      answer: 0,
      why: 'A request is hundreds of dependent steps, so the scheduler can change the batch between steps. A static batch keeps a finished sequence\'s slot idle until the longest one ends: 230 of 800 token-slots busy, 28.75%, for outputs 10, 10, 10 and 200.',
    },
    {
      q: 'The cache budget admits 437 sequences of 2,048 tokens. What lets block-wise allocation hold more requests of varying length?',
      options: [
        'It holds only the blocks a sequence has used, instead of reserving its maximum length up front',
        'It compresses the stored keys and values to half their size without changing any of the results',
        'It moves older tokens out to the main memory of the computer and brings them back when needed',
        'It shortens the prompts so that each sequence has fewer tokens to keep in the cache at once',
      ],
      answer: 0,
      why: 'Requests that average 600 tokens but may reach 4,096 fit 218 at a time when each reserves 4,096, and 1,472 when each holds 16-token blocks as it grows. The idea is called paged attention (from memory).',
    },
  ],
};

export default lesson;
