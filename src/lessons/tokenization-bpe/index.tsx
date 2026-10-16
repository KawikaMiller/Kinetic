import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A tokenizer turns text into integer ids by merging frequent neighbouring pieces: common words become one token, rare words split into learned fragments, and the whole thing is fitted to a corpus before the model trains.',
    what: 'Byte-pair encoding starts from single characters (or bytes) and a corpus, counts every adjacent pair, merges the most frequent one into a new symbol everywhere, and repeats; the ordered list of merges is the tokenizer. To encode new text it applies those merges in the order they were learned, without counting anything again. More merges mean a bigger vocabulary and fewer tokens per sentence. A byte alphabet can write any text, while a character alphabet needs an unknown symbol for characters it never saw. Token counts decide cost and how much fits in a context window. This lesson builds a toy on a made-up paragraph; it is not any real model\'s tokenizer.',
    analogy: 'A shorthand writer who, after reading a pile of letters, invents a single stroke for the pairs of letters that come up most often, then for pairs of strokes, until common words are one stroke and unusual words still spell out letter by letter.',
    useCases: [
      'Estimating the cost and context budget of a prompt from its token count',
      'Understanding why one language or domain needs more tokens than another for the same idea',
      'Debugging odd model behaviour on numbers, rare words and spelling questions',
      'Choosing and checking the tokenizer that matches a model before sending text to it',
    ],
    why: 'Tokens, not words or characters, are the unit that models read, bill and limit. Knowing how merges are learned and applied explains token counts, why some text costs more, why the tokenizer must match the model, and why letter-level questions are awkward for a model that sees ids.',
    watch: 'Each word is shown as chips. The symbol just made is yellow, merged symbols are green and single characters not yet merged are grey. In the pair table the first row is the most frequent pair; a hand-picked merge that was not the most frequent shows red in the merge list, and the corpus total turns red when it is higher than greedy merging would give. In the token views each chip is coloured by its position only, never by meaning, with its id under it; a red chip is an unknown symbol. Bytes appear in hex with the text they spell.',
  },
  tryThis: [
    'In Build a vocabulary press "Merge the most frequent" ten times: e s (9), es t (9), est </w> (9), l o (7), lo w (7), e w (6), ew est</w> (6), n ewest</w> (6), low </w> (5), d est</w> (3). Press Reset, then "merge by hand" on w e: the corpus has 87 symbols against 86 for greedy.',
    'In Vocabulary size (60 merges) "the newest tokenizer splits rare words into pieces" is 19 tokens, 2.63 characters per token, with 2 of 8 words whole. Drag Merges to 0: 51 tokens. Drag to 200: 15.',
    'In Bytes, "café" in Characters mode has one <unk> among 5 tokens. Switch to UTF-8 bytes: 6 tokens, none unknown, and é is the two bytes c3 a9. The table shows the Greek sentence needing 43 tokens against 9 for English.',
    'In Cost and counting the first sentence is 42 toy tokens: 4.1% of the 1,024 window and 0.000105 at the illustrative price. Pick the 256 window: 16.4%.',
    'In Cost and counting "tokenizer" has 2 e\'s but this toy tokenizer gives it 1 id (all nine letters and the end marker in one token); the number 2024202520262027 comes out as 9 pieces (202, 4, 202, 5, 202, 6, 202, 7 and the end marker).',
  ],
  keyIdeas: [
    'A token is a learned fragment, not a word: byte-pair encoding merges the commonest adjacent pair again and again, so common words become one token and rare words split into pieces.',
    'The tokenizer is fitted to a corpus before training and does not change when the model learns; to encode, it applies its merges in the order it learned them, without counting.',
    'A bigger vocabulary gives no more tokens for the same text, usually fewer. In this toy, text unlike the corpus, such as other languages, costs many more tokens.',
    'A model sees ids, not letters: an id says nothing about the characters in its token, which is one reason, often cited, that letter-level questions are harder.',
  ],
  quiz: [
    {
      q: 'What is a token in a byte-pair-encoding tokenizer?',
      options: [
        'A learned fragment: a whole common word, or a piece of a rarer one',
        'A whole word, found by splitting the text at its spaces and punctuation marks',
        'A single character, because the vocabulary is built from the alphabet alone',
        'A whole sentence, because merges keep joining pieces until a full stop is reached',
      ],
      answer: 0,
      why: 'Merging frequent neighbours makes common words single tokens and leaves rare words as several fragments, some of them just parts of words. A token is whatever the learned merges produce, not a linguistic unit.',
    },
    {
      q: 'When is a BPE tokenizer\'s vocabulary fitted?',
      options: [
        'Before the model is trained, on a corpus, as a separate preprocessing step',
        'During training, as each gradient step can add a merge that lowers the loss',
        'At encoding time, from the pair counts of the text being tokenized',
        'Never: it is fixed by the model\'s architecture and not by any data at all',
      ],
      answer: 0,
      why: 'The merge list is learned from a corpus first and then frozen; the model trains on the ids it produces. Encoding applies the saved merges in order and does not recount the new text, so the model\'s learning does not change the tokenizer.',
    },
    {
      q: 'The corpus is low (5 times), lower (2), newest (6) and widest (3), each word split into characters plus an end marker. Which pair is merged first, with ties broken lexicographically?',
      options: ['e s, found 9 times', 'w e, found 8 times', 'l o, found 7 times', 'n e, found 6 times'],
      answer: 0,
      why: 'Counting adjacent pairs: e s, s t and t </w> occur 9 times each (newest 6 and widest 3), more than w e at 8 or l o at 7. Of the three tied pairs, e s comes first alphabetically.',
    },
    {
      q: 'Why can a byte-level tokenizer encode any text, with nothing out of vocabulary?',
      options: [
        'Any text is a sequence of UTF-8 bytes, and each of the 256 byte values has a symbol',
        'It learns a new symbol on the spot for each character it has not met before',
        'It stores every character of every writing system as a separate vocabulary entry',
        'It maps each unknown character to its nearest known letter before encoding it',
      ],
      answer: 0,
      why: 'The base alphabet holds each byte value from 0 to 255, so any text encodes to bytes and each byte is a known symbol. An accented letter or an emoji is several byte tokens rather than an unknown one; merges just shorten the sequence.',
    },
  ],
};

export default lesson;
