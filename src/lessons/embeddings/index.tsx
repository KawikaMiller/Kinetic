import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An embedding turns a word, sentence or item into a list of numbers so that things used in similar ways end up pointing in similar directions; "similar" then becomes a cosine between vectors instead of a match between words.',
    what: 'An embedding model maps each input to a vector, often hundreds of numbers long. Nothing in it is a keyword: two texts can share no words and still get vectors with a high cosine (see `vectors-similarity`), and a phrase can be summarised by averaging its words\' vectors. Nearest neighbours by cosine power semantic search and recommendations, and groups of nearby vectors can be clustered (see `clustering-kmeans`). To look at them we squash them to 2-D with PCA, which keeps the directions of greatest variance and distorts the rest. This lesson uses 60 hand-made 8-dimensional toy vectors with named dimensions, so you can read every number; real models learn their vectors from text and their dimensions have no names.',
    analogy: 'A library shelved by topic instead of by title: a book about "fixing my vehicle" ends up next to "car repair" even though the titles share no words. The 2-D map is a photo of the shelves from one angle; some books that look side by side are rows apart.',
    useCases: [
      'Semantic search: rank documents by the cosine between their embedding and the query\'s',
      'Retrieval for chat assistants: fetch the passages closest to the question before answering',
      'Recommendations and "more like this": nearest neighbours of an item or a user',
      'Deduplication and clustering of support tickets, products or log messages',
    ],
    why: 'Embeddings are the plumbing under vector databases, semantic search and most LLM features you will touch. Knowing that they compare directions rather than words, that the pretty 2-D plot lies about distances, and that they inherit their training data\'s biases keeps you from trusting a similarity score more than it deserves.',
    watch: 'Word map: each dot is a word placed by PCA; your word (or the averaged phrase, a larger dot) is yellow, its 5 nearest words by cosine in 8-D are green with green lines to them, and other words are dark grey, or tinted by group with "Other words: By group" (animals orange, food pink, vehicles light blue, repair amber, describing words grey; the word chips use the same tints). In an analogy preset the two words whose difference is added are violet, the word the arrow starts from is yellow, and the violet arrow points to the result. In "Close on the map, far in 8-D" the two words and the line between them are blue: neighbours on the map only, not in 8-D. Labels follow their dot\'s colour. The vector panel shows each named dimension as a bar from the centre: blue to the right for positive, violet to the left for negative. Words vs meaning: a cosine above 0.8 shows green, and the top search result has a yellow tint. Refusals are red.',
  },
  tryThis: [
    'Click "kitten" in the word list, then "car": the green neighbours and the bars in the vector panel change with the word.',
    'Type "fixing my vehicle" in the field: "my" is listed as not in the toy vocabulary, and the averaged phrase lands among the repair words.',
    'Press "puppy − dog + cat", then "cow − big + small": the first analogy works because it was built in; the second misses "calf".',
    'Press "Close on the map, far in 8-D": two dots that touch on the map have a cosine near 0.',
    'In Words vs meaning, compare "car repair" with "fixing my vehicle", then search for "big vehicle" and read the ranking.',
  ],
  keyIdeas: [
    'Embeddings compare direction (cosine), not shared words: no overlap can still mean a close match.',
    'A phrase or document is often summarised by averaging its words\' vectors.',
    'A 2-D map of embeddings is a lossy projection; check similarity in the full space.',
    'Analogy arithmetic works only where the vectors happen to encode the relation, and embeddings carry their training data\'s biases.',
  ],
  quiz: [
    {
      q: '"car repair" and "fixing my vehicle" share no words. What will a good embedding model usually give them?',
      options: [
        'A high cosine, since they are used to mean much the same thing',
        'A cosine of zero, because they have no words in common at all',
        'A negative cosine, because their words are completely different',
        'No score at all: embeddings only compare texts that share words',
      ],
      answer: 0,
      why: 'Embeddings place texts by how they are used, not by spelling, so paraphrases land close together. Zero overlap is what keyword matching sees; "cosine of zero because no shared words" is that keyword intuition carried over, and it\'s exactly what embeddings were invented to get past.',
    },
    {
      q: 'Two words sit right next to each other on a 2-D PCA plot of embeddings. What can you conclude?',
      options: [
        'Little on its own: check their cosine in the full space first',
        'They must be close in the full space, since PCA keeps distances',
        'They are synonyms, because only synonyms ever overlap on the map',
        'They must come from the same group, since PCA groups by topic',
      ],
      answer: 0,
      why: 'PCA keeps the two directions of greatest variance and throws the rest away, so two points can coincide on the map while pointing in very different directions in the full space (the "Close on the map, far in 8-D" preset). PCA preserves distances only within the plane it keeps.',
    },
    {
      q: 'How does this lesson turn the phrase "small sweet cake" into one vector?',
      options: [
        'It averages the vectors of the known words in the phrase',
        'It keeps only the vector of the longest word in the phrase',
        'It multiplies the word vectors together, one dimension at a time',
        'It looks the whole phrase up as one entry in the vocabulary',
      ],
      answer: 0,
      why: 'The phrase vector is the mean of its known words\' vectors, and unknown words are listed and ignored. Averaging is a common baseline; real sentence-embedding models do something smarter, but the result is still one vector compared by cosine.',
    },
    {
      q: 'puppy − dog + cat lands on kitten here, but cow − big + small misses calf. Why?',
      options: [
        'Arithmetic only works where the vectors encode that relation',
        'The second one uses adjectives, which have no vectors at all',
        'Subtraction is undefined for vectors that contain negative numbers',
        'The model was not trained long enough to learn about calves yet',
      ],
      answer: 0,
      why: 'In these toy dimensions "small" moves only size, while a calf differs from a cow in age, so the arithmetic lands on small animals instead. Real embeddings are the same: some analogies hold because the data encodes them, many don\'t, and results are usually reported with the input words excluded. Training time isn\'t the issue here; these vectors weren\'t trained at all.',
    },
  ],
};

export default lesson;
