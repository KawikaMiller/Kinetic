import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Attention lets each token build its output as a weighted average of every token\'s value, with the weights from a softmax over query-key dot products; the n × n weight matrix is what makes long context expensive.',
    what: 'Each token is projected into a query, a key and a value. A token compares its query with every key (a dot product, divided by √d_k), a softmax turns the scores into weights that add to 1, and the output is the weighted sum of the values. Attention alone has no sense of order: shuffling the tokens only shuffles the outputs, so order comes from position codes or a causal mask. Several heads run in parallel with different weights. A transformer block adds a feed-forward layer and residual connections. The weight matrix has n² entries per head per layer, which is why cost grows with the square of the context length.',
    analogy: 'A meeting where each person asks a question (query), everyone holds up a label (key) and a note (value), and the asker takes a weighted blend of the notes, weighted by how well each label matches the question.',
    useCases: [
      'Language models, where each new token can look at earlier ones through a causal mask',
      'Translation and summarisation models that read a whole input at once',
      'Vision and audio models that apply the same mechanism to patches or frames',
      'Reasoning about context limits, memory use and cost when sizing a model deployment',
    ],
    why: 'Attention is the mechanism behind current language models, and its costs (the n² matrix, the √d_k scale, the need for position information) explain concrete limits you meet: context windows, memory use and why long prompts are slow. Knowing attention weights are weights, not explanations, keeps you from over-reading what a model is doing.',
    watch: 'The token being looked from is yellow. Attention weights are blue: line width and the number show the weight, and in the matrix a darker blue cell is a larger weight. Masked cells (weight forced to 0) are grey. Head A is amber and head B is pink. After shuffling, a green tick means the token kept its output and a red cross means it changed. In the cost scene the n² curve is red (the costly side) and the linear one green. In the lookup scene the largest weight turns green when it sits on the query\'s own key.',
  },
  tryThis: [
    'In One head, "cat" is selected: it puts 0.34 on itself, 0.24 on "mat" and 0.20 on "sat", and each row of the matrix adds to 1. Drag cat\'s dim 2 slider down to 0: its weight on "mat" falls.',
    'In Why √d_k (d_k = 64) the standard deviation of q·k reads about 8 and the largest weight over 8 keys averages 0.88 unscaled and 0.36 scaled. Drag d_k to 512: 0.96 unscaled, still 0.36 scaled.',
    'In Mask, heads, position press "Shuffle the tokens" with everything off: all 6 tokens keep their output. Now turn on Two heads and the Position code: all 6 outputs change.',
    'In Learn a lookup press Train (or Step 10 thirty times): the weight on key A rises from about 29% to 92% by epoch 300. Press "Train 20 seeds": all 20 learn it.',
    'In Cost of context (n = 4,096) each head of each layer holds 16,777,216 weights. Press 8,192: four times as many, 67,108,864.',
  ],
  keyIdeas: [
    'Attention is a weighted average: softmax(Q Kᵀ / √d_k) V, so each row of weights adds to 1 and each output mixes the value vectors.',
    'Dividing by √d_k keeps the scores on a scale of about 1: here the largest of 8 weights averages 0.88 unscaled and 0.36 scaled at d_k = 64.',
    'In this model, shuffling the tokens merely shuffles the outputs until a position code or a causal mask brings in order.',
    'The n × n weight matrix makes attention cost grow with the square of the context length: doubling n multiplies the weights by 4.',
  ],
  quiz: [
    {
      q: 'What are the attention weights a transformer layer computes for a token?',
      options: [
        'Mixing weights over the other tokens\' values; whether they explain a prediction is debated',
        'A record of which input words caused the output, so they explain the prediction',
        'Probabilities that each input word is the next word the model will produce',
        'A measure of how important each word is to a human reader of the sentence',
      ],
      answer: 0,
      why: 'The weights say how the layer blended value vectors, not why a prediction came out as it did. Research disagrees on how far they explain behaviour (Jain and Wallace 2019 and Wiegreffe and Pinter 2019, from memory, verify), so read them as weights, not reasons.',
    },
    {
      q: 'The tokens are shuffled and fed to an attention layer with no position information and no mask. What happens to its outputs?',
      options: [
        'They are the same rows as before, just in the shuffled order',
        'They change, because the layer reads the tokens from left to right',
        'They all collapse to one identical row, because the shuffle destroys the information',
        'They change, because softmax depends on the order of its inputs',
      ],
      answer: 0,
      why: 'Without position codes or a mask nothing in the layer depends on where a token sits, so each token\'s output is the same and just its place moves. Adding a position code or a causal mask is what lets the layer use order.',
    },
    {
      q: 'Why does attention divide the query-key scores by √d_k?',
      options: [
        'Dot products of random vectors spread like √d_k, pushing softmax toward one-hot and shrinking gradients',
        'It makes each row of weights add up to 1, which softmax would not do without the division',
        'It keeps the weights positive, since raw dot products can be negative and an exponential needs positive input',
        'It stops the model attending to a token twice when two tokens have the same embedding',
      ],
      answer: 0,
      why: 'For random entries the dot product has standard deviation √d_k, so large d_k gives large score gaps and a nearly one-hot softmax that passes little gradient to the other keys. Softmax already makes rows add to 1 and keeps weights positive.',
    },
    {
      q: 'The context grows from 4,096 to 8,192 tokens. What happens to the number of attention weights per head?',
      options: ['It grows 4 times', 'It doubles', 'It grows 8 times', 'It stays the same'],
      answer: 0,
      why: 'Each token attends to the whole sequence, so there are n × n weights, and doubling n gives 2 × 2 = 4 times as many: 67,108,864 against 16,777,216.',
    },
  ],
};

export default lesson;
