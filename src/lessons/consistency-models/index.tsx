import type { LessonModule } from '../../core/types';
import { BROKEN_SEED, FOLLOWER_NOT_SEQUENTIAL_SEED } from './service';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: '"Consistent" names several different promises. Each one is a rule a recorded history of reads and writes either satisfies or breaks, and a checker can tell you which.',
    what: "A history is a list of reads and writes with the time each was sent and the time it was answered. Linearizability asks for one order of all of them that respects real time. Sequential consistency keeps each client's own order but ignores the clock. Causal consistency only orders operations related by cause. Eventual consistency only promises that the copies agree once the writes stop. Serializability is a different axis: transactions over many objects, not one register.",
    analogy: 'Four ways to read a group chat on several phones: one shared transcript the instant a message is sent (linearizable), the same transcript but possibly late (sequential), a reply never showing before the message it answers (causal), or phones that disagree for a while and settle on the same thing (eventual).',
    useCases: [
      'Choosing whether reads go to the leader or to any replica, and knowing what the second can return',
      'Reading a database\'s documentation for what "strong", "session" or "eventual" actually promises',
      'Reading a report where a test tool checks a real database against these models from recorded histories',
      'Explaining a "I saved it and it vanished" bug as a missing read-your-writes guarantee',
    ],
    why: 'Teams argue about consistency with one word for several guarantees. Naming the model, and being able to check a history against it, turns a vague "it is consistent" into a claim you can test.',
    watch:
      "Clients are plain categories: C1 amber, C2 sky, C3 pink. A write is a solid bar, a read an outlined bar with the value it returned. A model that accepts the history is green and one that rejects it is red. The bars ringed in yellow are the smallest set that already breaks the model in focus, and the blue numbered dots are one order the operations can be put in when it holds. In the chain, the strongest model that holds is solid green, the weaker ones it implies are tinted green, the stronger ones are red, and the blue converged box stands beside it. In the simulated service the same colours read a history recorded from three replicas and three clients; the chips under each scene say what is simulated, a toy, illustrative or from memory.",
  },
  tryThis: [
    'The default history is "stale read after an acknowledged write": C1 writes 1 and C2 then reads 0. Linearizable fails, sequential and causal hold, and the ringed bars are just C1\'s write and C2\'s read.',
    'Press C2\'s read to select it and press the ◀ button twice: the read now shares a slot with the write, so the two overlap and linearizable turns to holds.',
    'Load "concurrent writes seen in two orders": causal holds but sequential fails, and converged says no because C1 and C2 end on different values. Then load "causality broken": converged says yes although causal fails.',
    'In "How the models relate", drop in "concurrent writes seen in two orders": causal is the strongest green box, linearizable and sequential are red, and the blue converged box says no.',
    `In "A simulated register service" the default is follower reads on seed ${BROKEN_SEED}: linearizable fails and sequential holds. Pick "One leader serves everything" and all three hold; pick "Session cache on the client" and sequential and causal hold while linearizable fails. Back on follower reads, "Lowest seed that breaks sequential" lands on seed ${FOLLOWER_NOT_SEQUENTIAL_SEED}.`,
  ],
  keyIdeas: [
    'Linearizable: one order of the operations that respects real time, so a read that starts after a write finished sees it.',
    'Sequential: one order that keeps each client\'s own order but ignores the clock, so a read can be stale against real time.',
    'Causal: operations related by cause are seen in cause order, while unrelated writes can be seen in different orders by different clients.',
    'Converged says where the copies end up, not what order they were seen in, and serializability is a separate axis: transactions over many objects.',
  ],
  quiz: [
    {
      q: 'Which of these describes serializability and linearizability correctly?',
      options: [
        'Serializability covers transactions over many objects; linearizability covers one object and respects real time',
        'Serializability is the stronger of the two, so any serializable database is linearizable as well',
        'They are two names for one guarantee, used by databases on one side and by caches and stores on the other',
        'Linearizability is the stronger of the two, so any linearizable store is serializable as well',
      ],
      answer: 0,
      why: 'They are different axes, not a ladder. One is about the order of whole transactions, the other about real time on a single object. A guarantee with both is called strict serializability.',
    },
    {
      q: 'C1 writes 1 and is told it is done. Afterwards C2 reads 0. Which models can accept that history?',
      options: [
        'Sequential and causal consistency accept it, but linearizability does not',
        'Linearizability, because the read and the write belong to different clients',
        'None of the three, because a read has to return the latest acknowledged write',
        'Only causal consistency, because sequential consistency also needs real time',
      ],
      answer: 0,
      why: 'The read started after the write finished, so linearizability rejects it. Sequential consistency can put the read before the write in its one order, and causal consistency has no cause tying the two together.',
    },
    {
      q: 'A team says their store is sequentially consistent, so a read always returns the latest write. What is wrong with that?',
      options: [
        'It ignores real time, so a read can be older than a write acknowledged elsewhere',
        'It lets a client see its own writes out of order, which is why reads can be stale',
        'It only holds while every replica is up, so a crash is what makes a read stale',
        'Nothing is wrong, since one order of all the operations means the latest write is read',
      ],
      answer: 0,
      why: 'The one shared order has to keep each client\'s own order and explain what each read returned, but it does not have to follow the clock. "Strong" and "latest" are linearizability words.',
    },
    {
      q: 'A history ends with every client reading 2, but one client read 2 and then read 1. Which statement is right?',
      options: [
        'It is converged but not causally consistent, because convergence says nothing about order',
        'It is causally consistent, because the clients agree on 2 once the writes stop',
        'It is neither, because convergence needs a linearizable order to begin with',
        'It is causally consistent, because 1 was written before 2 in the history',
      ],
      answer: 0,
      why: 'Convergence is a promise about the end state. A client that saw the newer write and then the older one broke the order cause and effect require, whatever the clients read after the writes stop.',
    },
    {
      q: 'In the simulated service the follower-reads design returns a stale value. What causes that?',
      options: [
        'The leader acknowledged the write before copying it to the follower that answered the read',
        'The network dropped the write on its way to the leader and the client never found out about it',
        'Two clients wrote at the same moment, so the leader could not tell which one came first',
        'The checker is too strict, because a read of an older value is acceptable in any model',
      ],
      answer: 0,
      why: 'Copies travel after the acknowledgement, so for a while a follower holds the older value. The same schedule routed through one leader passes, which is how you know the routing was the cause.',
    },
  ],
};

export default lesson;
