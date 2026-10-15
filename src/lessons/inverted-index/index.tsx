import type { LessonModule } from '../../core/types';
import { DEFAULT_DOCS } from './corpus';
import { PHRASE, REVERSED_PHRASE, THREE_WORDS, buildFacts, compressFacts, phraseFacts, queryFacts, rankFacts } from './facts';
import { Stage } from './Stage';

const build = buildFacts();
const query = queryFacts();
const phrase = phraseFacts();
const rank = rankFacts();
const compress = compressFacts();

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A search engine does not scan documents: it keeps an inverted index, a map from each word to a sorted list of the documents that hold it, answers queries by merging those lists, and ranks the matches with a formula such as BM25.',
    what: 'An analyzer cuts each document into terms (lowercase, split, drop stop words, stem). The index maps every term to a posting list of document ids, frequencies and positions, sorted by id, so AND is an intersection and OR a union of sorted lists, done with one cursor on each that only moves forward, and a phrase checks that positions are adjacent. Matches are ranked by a score such as BM25, which rewards a rare word and a repeated word but saturates, and corrects for document length. Lists are stored as gaps in variable-byte form, and new documents go into new immutable segments that are merged later.',
    analogy: 'The index at the back of a book: instead of reading every page for "cat", you look the word up and get page numbers in order; to find pages with both "cat" and "dog" you walk the two lists of page numbers side by side.',
    useCases: [
      'Site, log and code search over text that people type queries against',
      'Filtering records by several words or tags at once',
      'Ranking help articles or products for a typed query',
      'Reading what Lucene-based engines do underneath',
    ],
    why: 'Knowing that search is a lookup and a merge, not a scan, explains why it is fast, why analyzer choices such as stemming change which documents match, and why ranking constants and updates behave the way they do.',
    watch:
      'Build the index: a word the stop-word step removed is dim and struck through, one the stemmer changed is violet with an arrow, and terms are blue. Query: the yellow cell is the id being compared on the left, the blue one the second cursor on the right, green ids went into the result and dim ones were skipped; matched words in a document are highlighted yellow. Ranking: blue bars are scores relative to the best, and the code panel works the formula with the top result\'s numbers. Compression: a blue byte has its continuation bit set, a green one ends a number. Chips say what is real, a toy or from memory.',
  },
  tryThis: [
    `In "Build the index", the term ${build.word} sits in ${build.docs.length} of ${DEFAULT_DOCS.length} documents (${build.docs.join(', ')}). Switch the toy stemmer off: the dictionary grows from ${build.terms} to ${build.termsWithoutStemmer} terms, because plurals such as cats become entries of their own.`,
    `In "Query", the default query "cat dog" with AND finds ${query.twoDocs} documents in ${query.twoComparisons} comparisons. Change it to ${THREE_WORDS}: merging the shortest list first takes ${query.threeShortest} comparisons, and "As typed" takes ${query.threeTyped}.`,
    `In "Query", type ${PHRASE}: ${phrase.phrase.join(' and ')} match, because the two words sit next to each other there. The reversed phrase ${REVERSED_PHRASE} matches ${phrase.reversed === 0 ? 'nothing' : `${phrase.reversed} documents`}.`,
    `In "Ranking", press "Add a document that repeats cat 10 times": it ranks number ${rank.tfidf} by TF-IDF but number ${rank.bm25} of ${rank.matches} by BM25 at the defaults. Drag k1 to 0 and it drops to number ${rank.bm25k0}.`,
    `In "Compression and updates", pick "A big collection" of ${compress.collection.toLocaleString('en-US')} documents: ${compress.count} ids take ${compress.fixed} bytes at 4 bytes each, ${compress.ids} as variable-byte ids and ${compress.gaps} as variable-byte gaps.`,
  ],
  keyIdeas: [
    'A search engine reads a precomputed map from term to a sorted posting list and merges lists, so in this model no document is scanned to answer a query.',
    'AND is an intersection and OR a union of sorted lists, done with one cursor on each that moves forward, so the cost grows with the list lengths and the order of the merges changes it.',
    'BM25 rewards a rare word and a repeated word but saturates, and b sets how far a long document is penalised; in this model k1 = 0 ignores how often a word repeats.',
    'Posting lists shrink when stored as gaps in variable-byte form, and one new document touches many lists, which is why engines write immutable segments and merge them later.',
  ],
  quiz: [
    {
      q: 'A user searches for two words. How does an inverted-index engine find the documents that hold both?',
      options: [
        'It reads the two posting lists of document ids and intersects them with two cursors, without opening the documents',
        'It scans each stored document for both words in id order, stopping early once it has enough results to show',
        'It looks up the hash of each word and returns the documents whose stored hashes are equal, in no particular order',
        'It first sorts every document by relevance to the query, then checks which of them hold both of the words',
      ],
      answer: 0,
      why: 'The index already maps each word to the documents that hold it, so the work is a merge of two sorted lists. Reading the documents themselves is what the index avoids.',
    },
    {
      q: 'A document repeats a query word ten times. Under BM25 with k1 = 1.2, how does its score for that word compare with a single occurrence?',
      options: [
        'Higher, but well under ten times higher, because the contribution saturates as the count grows',
        'Ten times as high, because BM25 multiplies the weight of the word by how often it appears',
        'The same, because BM25 only checks whether the word occurs in the document at all, not how often',
        'Lower, because a word repeated that often is treated as spam and cut down by the length term',
      ],
      answer: 0,
      why: 'The frequency term f(k1 + 1) / (f + k1 · norm) rises with f but levels off toward k1 + 1. A smaller k1 levels off sooner, and k1 = 0 makes each occurrence count once.',
    },
    {
      q: 'Why do engines often intersect the shortest posting list first?',
      options: [
        'The first list caps how many ids can survive, so later merges meet a short list and the chain can stop sooner',
        'Shorter lists are already sorted by id, while longer ones have to be sorted again before they can be merged',
        'The answer differs when a longer list goes first, so the shortest has to come first to get a correct result',
        'A short list is read from disk faster, and that is the whole effect the order has on the work of the query',
      ],
      answer: 0,
      why: 'Each list is sorted, and the result is the same in any order. The order changes how many comparisons are made, because a short running result is cheap to merge against the long lists.',
    },
    {
      q: 'To match the phrase "cat sat", what does the index need beyond which documents hold each word?',
      options: [
        'The positions of each word in each document, so adjacent positions can be checked',
        'The frequency of each word, so that cat appears exactly as often as sat in the document',
        'Nothing more: a document that holds both words has them next to each other in order',
        'A second index of whole sentences, since lists of words cannot express any order at all',
      ],
      answer: 0,
      why: 'Document ids say both words occur somewhere. A positional index stores where, so the engine can check that sat comes right after cat. The word positions here are counted after the analyzer, so a dropped stop word closes the gap.',
    },
    {
      q: 'Why are posting lists stored as gaps between ids rather than the ids themselves?',
      options: [
        'Gaps are small numbers, and a variable-byte code spends a single byte on any number below 128',
        'Gaps stay below 128 in a sorted list, so each of them fits in one byte whatever the collection size',
        'Gaps let the engine skip decoding, since only the first id of a list needs to be stored on disk',
        'Gaps make the list unsorted, which lets a new document be slotted in without merging any segments',
      ],
      answer: 0,
      why: 'Sorted ids that are close together differ by small amounts, and a variable-byte code writes small numbers in few bytes. The list is decoded by adding the gaps back up, which is why it has to stay sorted.',
    },
  ],
};

export default lesson;
