import type { LessonModule } from '../../core/types';
import { fullPhrase } from './views';
import { BIG_CHUNK_SIZE, BIG_K, OVERLAP_FIX_PCT, WIDE_SIZE, answerFacts, chunkFacts, measureFacts, retrieveFacts } from './facts';
import { cos } from './captions';
import { CONTEXT_BUDGET_WORDS } from './generate';
import { CHUNK_DEFAULT, MEASURE_DEFAULT, RETRIEVE_DEFAULT } from './settings';
import { Stage } from './Stage';

const chunk = chunkFacts();
const retrieve = retrieveFacts();
const answer = answerFacts();
const measure = measureFacts();
const pctOf = (share: number) => Math.round(share * 100);
const answerOverlap = pctOf(answer.overlap);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Retrieval-augmented generation hands a model the right passages before it answers: chunk the documents, score the chunks against the question, fit the best ones into the prompt, and let the generator work from only those.',
    what: 'A pipeline cuts pages into chunks, scores each chunk against the question (here by word overlap, as a stand-in for an embedding), keeps the top k, packs them into a prompt with a size budget and asks a generator to answer with a citation. Each step can lose the answer: a chunk boundary can split it, a paraphrase can score low, the budget can cut it, and a generator that always answers will state something even when it was handed the wrong pages. Recall@k, measured against gold sentences you define, shows which settings keep the answer in reach.',
    analogy: 'A student sitting an open-book exam who may only photocopy a few pages: what they write can only be as good as the pages they chose to copy.',
    useCases: [
      'Question answering over a help centre or internal wiki',
      'Support assistants that cite the page an answer came from',
      'Search features that quote a passage instead of linking a document',
      'Tuning chunk size, overlap and top-k in a retrieval pipeline',
    ],
    why: 'When an assistant answers wrongly the cause is often upstream of the model: the answer was split, ranked low or cut from the prompt. Knowing the stages and measuring recall lets you find the stage that failed instead of rewording the prompt.',
    watch:
      'Chunk it: the page text is washed in sky, pink and amber blocks, one per chunk, with a dashed underline on words two chunks share; the gold sentence has a yellow outline when one chunk holds it whole and an orange outline when it is split. Retrieve: ranked chunks with blue score bars, green when they hold the gold sentence and red when they do not; the violet bar is the prompt budget and struck grey lines are chunks cut from it. Answer: the card is green for a right answer, red for a confident wrong one and orange dashed for an abstention, with a violet citation. Measure: blue and violet curves are recall for TF-IDF and BM25, the yellow line is your chunk size.',
  },
  tryThis: [
    `In "Chunk it", the page for question ${chunk.question} is cut into ${CHUNK_DEFAULT.size}-word chunks with no overlap, and its gold sentence is split over ${chunk.open.touching} chunks so no chunk holds it. Set Overlap to ${OVERLAP_FIX_PCT}%: it sits inside one chunk, which scores ${cos(chunk.fixed.cosine ?? 0)} against the question. Then raise Chunk size to ${WIDE_SIZE}: the score falls to ${cos(chunk.wide.cosine ?? 0)}.`,
    `In "Retrieve and assemble", the default question ${RETRIEVE_DEFAULT.question.toUpperCase()} at ${RETRIEVE_DEFAULT.size} words and top-${RETRIEVE_DEFAULT.k} retrieves no chunk that holds the gold sentence. Set Chunk size to ${BIG_CHUNK_SIZE} and Top k to ${BIG_K}: the gold chunk is ranked ${retrieve.goldRank}, but ${retrieve.goldFits ? 'it still fits' : `the ${CONTEXT_BUDGET_WORDS}-word budget cuts it`}, so the model never sees it.`,
    `In "The stand-in answerer", question ${RETRIEVE_DEFAULT.question.toUpperCase()} retrieves the wrong chunks and the stand-in answers anyway, the best sentence sharing ${answerOverlap}% of the question's words: ${answer.off.verdict === 'wrong' ? 'a confident wrong answer' : 'an answer'}. Switch Grounding instruction on and it ${answer.on.verdict === 'abstained' ? 'abstains with "not found in the sources"' : 'still answers'}.`,
    `In "Measure it", at ${MEASURE_DEFAULT.size} words and top-${MEASURE_DEFAULT.k} TF-IDF recall is ${measure.tfidfAtDefault}% and BM25 ${measure.bm25AtDefault}% on the eight questions. TF-IDF reaches 100% ${fullPhrase(measure.curveAtDefaultK)} at top-${MEASURE_DEFAULT.k}; set Top k to ${BIG_K} and it reaches it ${fullPhrase(measure.curveAtBigK)}: a one-size spike on eight questions is noise, not a setting to trust.`,
  ],
  keyIdeas: [
    'The generator only sees what retrieval hands it and the prompt budget lets through, so in this model a missed or cut chunk cannot be recovered downstream.',
    'A chunk boundary can split the answer; overlap lets one chunk hold it whole, at the price of more chunks to store and score.',
    'Very large chunks dilute the score of the sentence that matters, and very small ones split it, so the best size sits between them for a given corpus.',
    'A generator that answers whatever it is given produces a confident wrong answer when retrieval fails; abstaining is a different failure, and recall@k on gold sentences you wrote tells you which one you have.',
  ],
  quiz: [
    {
      q: 'The answer sentence straddles a chunk boundary, so no chunk holds it whole. Which change fixes that, and what does it cost?',
      options: [
        'Overlap between chunks lets one chunk hold the sentence, at the price of more chunks to store and score',
        'A lower top-k keeps only the best chunk, so the sentence is never cut by the boundary in the first place',
        'Switching the scorer to BM25 makes the ranking read across the boundary and join the two halves together',
        'A longer system instruction tells the model to look past the edge of a chunk for the rest of the sentence',
      ],
      answer: 0,
      why: `With ${CHUNK_DEFAULT.size}-word chunks and no overlap the gold sentence of ${chunk.question} is split over ${chunk.open.touching} chunks; with ${OVERLAP_FIX_PCT}% overlap one chunk holds it, and the page has ${chunk.fixed.chunks.length} chunks instead of ${chunk.open.chunks.length}.`,
    },
    {
      q: 'A pipeline answers questions from your help pages. What does the model see when it writes an answer?',
      options: [
        'Only the retrieved chunks that fit the prompt budget, plus the question; the rest never reaches it',
        'Every page in the index, with the retrieved chunks marked as the ones it should prefer when it answers',
        'The retrieved chunks and, through them, the full pages they were cut from, read in full by the model',
        'Whatever the scorer ranked highest, even when it overflowed, since the budget limits only the question text',
      ],
      answer: 0,
      why: `At ${BIG_CHUNK_SIZE}-word chunks and top-${BIG_K} the ${CONTEXT_BUDGET_WORDS}-word budget fits ${retrieve.bigger.prompt.items.filter((i) => i.fits).length} of ${retrieve.bigger.prompt.items.length} chunks, and the gold chunk ${retrieve.goldFits ? 'is among them' : 'is the one that is cut'}. The model works from the prompt, not from your data.`,
    },
    {
      q: 'The right chunk is missing from the answer, so you raise top-k from 2 to 8. What can go wrong?',
      options: [
        'Low-ranked chunks add noise and use budget, so the chunk that matters can still be cut or drowned out',
        'Nothing can go wrong: recall rises with k and the prompt grows to hold every chunk that is returned to it',
        'The chunks are cut again to fit the new k, so the overlap setting no longer has any effect on their size',
        'The scorer is re-run on the new k, which changes the scores of the chunks that were already found before',
      ],
      answer: 0,
      why: `Retrieval returns the same ranking for any k, so a larger k adds lower-ranked chunks and nothing else. The prompt budget is ${CONTEXT_BUDGET_WORDS} words, so extra chunks are cut in rank order and the question's gold chunk can be one of them.`,
    },
    {
      q: 'Retrieval misses the gold chunk and the grounding instruction is off. What does the scripted stand-in answerer do?',
      options: [
        'It answers with the best sentence it was given, a confident wrong answer rather than an abstention',
        'It reports not found in the sources, because the gold chunk is missing from the context it was handed',
        'It searches the full index for the gold sentence and answers correctly in spite of the miss in retrieval',
        'It stops with an error, because a missing chunk breaks the step that attaches the citation to the answer',
      ],
      answer: 0,
      why: `In the answer scene the default question retrieves the wrong chunks and the rule answers with a sentence sharing ${answerOverlap}% of the question's words: ${answer.off.verdict === 'wrong' ? 'wrong' : 'an answer'}. With the instruction on it abstains, which is a different failure from a wrong answer.`,
    },
    {
      q: `At ${BIG_CHUNK_SIZE}-word chunks and top-${BIG_K}, TF-IDF recall is 100% on the eight questions. What does that show?`,
      options: [
        'That this setting found all eight gold sentences here; eight questions are too few to say more',
        'That the pipeline will answer every real user question correctly at that size and that scorer in future',
        'That recall cannot improve further, so no other chunk size or scorer can do better on these questions',
        'That the answerer is right on all eight too, since perfect retrieval guarantees a perfect final answer',
      ],
      answer: 0,
      why: `Recall@k says the gold chunk was retrieved, not that the answerer picked the right sentence: it can still choose another one, and BM25 scores ${measure.bm25AtBig}% at the same setting. Eight invented questions are a toy evaluation set.`,
    },
  ],
};

export default lesson;
