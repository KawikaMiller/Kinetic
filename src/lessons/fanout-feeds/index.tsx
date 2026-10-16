import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A feed can be built when a post is written (push: copy it into every follower\'s inbox) or when it is read (pull: merge the people you follow). Which is cheaper depends on the read-to-write ratio and on how uneven the follower counts are.',
    what: 'Push does the work at write time: one post becomes one inbox insert per follower, and a read is one inbox read. Pull stores the post once and builds the feed at read time by merging the newest posts of everyone the reader follows, about F + N log F operations for F people and a page of N. An account with a huge following makes push slow (the last follower waits for the whole fan-out); a reader who follows thousands makes pull slow. The hybrid pulls the few big accounts and pushes the rest, which bounds the slowest post. All three build the same newest-N list; they differ in where and when the work happens.',
    analogy: 'A newspaper delivered two ways. Push is a paperboy who drops a copy on every doorstep when the paper is printed: printing day is heavy and reading is instant. Pull is a newsstand: printing is one stack, and each reader walks over and assembles their own pile from the stacks of the papers they follow.',
    useCases: [
      'Designing the home timeline of a social product or an activity feed',
      'Deciding where to spend work in any read-heavy or write-heavy fan-out, such as notifications',
      'Explaining why one account with millions of followers needs special handling',
      'Reasoning about stale feeds after a post, a delete or an edit',
    ],
    why: 'The same product can be fast on a quiet day and fall over when one account posts. Knowing which side the cost lands on, and how the follower distribution moves it, is what the design is about.',
    watch:
      'Blue is push work, an inbox write (the bars and the write-cost number), and violet is pull work, a merge read. In the inbox grid green is an inbox that already holds the post and orange one still empty, a stale feed not yet fanned out. Yellow is the number of celebrity authors the hybrid pulls, shown as a count only, and in the totals green is the cheap side and red the costly one. In the read-cost plot violet points are measured merges and the grey dashed line is the estimate F + N log2 F, which the measured points sit about 1.5 to 1.9 times above. The chips say what is simulated, illustrative or scripted.',
  },
  tryThis: [
    'At the defaults in "Push: fan-out on write" (5,000 followers, 10 workers, 1 ms an insert) press play: the write cost is 5,000 inserts and the last follower sees the post after 500 ms. Drag Fan-out workers to 50 and it drops to 100 ms; drag Followers of the author to 100,000, back at 10 workers, and it is 10 s.',
    'In "Pull: fan-out on read" the write cost stays 1 whatever you drag. Move "People the reader follows" from 50 to 2,000: the read cost grows with it, and the measured points stay a steady factor (the "Measured / estimate" stat) above the grey estimate line.',
    'In "The hybrid" at the defaults one read per post makes pure push cheaper than pure pull. Drag Reads per post to 0.05 and pull is cheaper; the "Crossover" stat says where they meet.',
    'In the same scene drag the threshold to 0: the hybrid bar equals pure pull and the slowest post is a single store. Drag it to the end: it equals pure push, and the slowest post is the biggest author\'s fan-out.',
    'In "Details that bite" press "Deletes and edits": removing one post from the most-followed author\'s followers is a second fan-out, the same size as the first. Press "Inactive users" and the push shrinks to the readers who are active.',
  ],
  keyIdeas: [
    'Push does its work at write time, one insert per follower, and a read is one inbox read; pull stores a post once and pays a merge of about F + N log F on each read.',
    'Which one is cheaper depends on the read:write ratio and the follower distribution: an account with a huge following breaks push, and a reader who follows thousands breaks pull.',
    'In this model the hybrid does not beat the cheaper of push and pull on total work; it bounds the slowest post by pulling only the authors above a threshold.',
    'The three strategies build the same newest-N feed (this lesson\'s tests check each against collect-sort-take-N); they differ in where and when the work happens.',
  ],
  quiz: [
    {
      q: 'An account with five million followers makes one post. Why does fan-out on write struggle with it?',
      options: [
        'One post turns into five million inbox writes, and the last follower waits for all of them',
        'A read of the feed has to merge five million lists, which makes every read far too slow',
        'The post has to be stored five million times in the posts table before anyone can see it',
        'Followers cannot read the post until each of them has refreshed their own inbox by hand',
      ],
      answer: 0,
      why: 'Push does its work at write time, so the cost is one insert per follower. Spreading them over workers shortens the wait, and a pulled post avoids it altogether.',
    },
    {
      q: 'A reader follows two thousand accounts and opens their feed. Why does fan-out on read struggle?',
      options: [
        'Each read is one inbox read, so it ought to be fast, but the inbox itself is enormous here',
        'The post is stored once for every follower, which makes writes very slow for the author',
        'Each read merges the newest posts of two thousand people, so read work grows with F',
        'The reader\'s feed has to be rebuilt in full whenever any one of the accounts posts',
      ],
      answer: 2,
      why: 'Pull builds the feed at read time with a k-way merge, roughly F + N log F operations. The cost lands on the reader and grows with how many people they follow.',
    },
    {
      q: 'In the hybrid scene, what does the hybrid feed do?',
      options: [
        'It pushes the posts of accounts above a follower threshold and pulls the others',
        'It pulls the posts of accounts above a follower threshold and pushes the others',
        'It pushes to followers who are active and pulls for those who are not',
        'It picks push or pull for each reader by how often that reader opens the app',
      ],
      answer: 1,
      why: 'The few big accounts are the ones whose fan-out is slow, so they are merged in at read time, while the many small accounts are pushed.',
    },
    {
      q: 'Which statement about the feeds the three strategies build is right?',
      options: [
        'Push feeds are newer than pull feeds, because they are ready before the read ever starts',
        'Pull feeds are exact and push feeds are approximate, because inboxes are copies',
        'The hybrid feed leaves out the celebrities, which is the price of its lower cost',
        'They build the same newest-N list, and differ in where and when the work happens',
      ],
      answer: 3,
      why: 'In this model each strategy is checked against a brute-force feed and matches it. A push feed can be stale for a moment while the fan-out drains, but it is not a different list.',
    },
    {
      q: 'When does fan-out on write beat fan-out on read?',
      options: [
        'When a post is read many times, because each read is one cheap inbox read',
        'When a post is read rarely, because the inboxes then stay mostly empty',
        'When the author has millions of followers and each post is read only a few times',
        'When the feed is ranked at read time, because the inbox then holds the final order',
      ],
      answer: 0,
      why: 'Push pays once at write time and saves on each read, so it wins when reads per post are high. With few reads per post the up-front inserts are wasted work.',
    },
  ],
};

export default lesson;
