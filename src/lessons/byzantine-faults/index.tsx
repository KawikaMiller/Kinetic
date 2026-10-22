import type { LessonModule } from '../../core/types';
import { integer } from '../../core/format';
import { breakText, behaviourOfState, DEFAULT_TRAITOR_STATE, rulesBrokenIn, runOm, setupOfState, tryEveryBehaviour, tryEveryRule } from './om';
import { SIGNED_N } from './signed';
import { Stage } from './Stage';

const three = tryEveryBehaviour(3);
const four = tryEveryBehaviour(4);
const rules3 = tryEveryRule(3);
const rulesBroken3 = rulesBrokenIn(three);
const rules4 = tryEveryRule(4);
const defaultBreak = breakText(3, behaviourOfState({ ...DEFAULT_TRAITOR_STATE, traitor: 2 }));
const defaultRun = runOm(setupOfState(DEFAULT_TRAITOR_STATE));
const L1_DECIDES = defaultRun.decisions.get(1);

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'With oral messages three generals cannot tolerate one traitor and four can: a loyal lieutenant that hears two different stories has no way to tell who lied. For f traitors the number needed is 3f + 1 (argued, not run here), and signatures change the game.',
    what: `A commander sends an order, its lieutenants relay what they heard, and each loyal lieutenant takes the majority of what it holds, retreating on a tie. You choose what the traitor says on each edge and watch ${rulesBroken3.join(' and ')} (the loyal lieutenants obey a loyal commander) break at three generals, while IC1 (the loyal lieutenants agree) is the rule the six-general scene breaks. The lesson then tries each traitor behaviour (${three.total} at three generals, ${four.total} at four), each decision rule (${rules3.rules} and ${integer(rules4.rules)}), enumerates quorum overlaps, adds signatures, and samples a larger cluster.`,
    analogy: 'Three people pass notes to agree on a plan. When one of them lies, each of the other two holds a pair of notes that disagree, with nothing to say which note is true. A fourth person\'s note breaks the tie.',
    useCases: [
      'Reading why Byzantine-tolerant replication asks for 3f + 1 replicas',
      'Designing a system where a node may be compromised, not merely crashed',
      'Contrasting crash-fault consensus such as Raft with Byzantine tolerance',
      'Explaining what signed messages buy a protocol, and what they assume about timing',
    ],
    why: 'A crashed node is silent, while a lying node tells different peers different things. Knowing the price of that, in extra nodes or in signatures, shows what a design assumes about its members.',
    watch:
      'The commander is amber and the lieutenants are sky, plain categories. The traitor and the messages it chose are orange, a labelled actor rather than an error. A conflicting pair of messages and a broken rule are red, and a rule that holds is green. The nodes two quorums share are yellow, and a signed order carries a violet tag. The chips say what is a toy, sampled, simulated or from memory.',
  },
  tryThis: [
    `Press Run: L1 decides ${L1_DECIDES} (retreat) although the commander said attack. The stage reads "${defaultBreak}" and IC2 turns red.`,
    'Switch to 4 generals (L2 stays the traitor and tells each lieutenant 0) and press Run: L1 and L3 both decide 1, and both rules hold.',
    `Press Try every traitor behaviour at 3 generals, then at 4: "${three.total} behaviours, ${three.breaking.length} break a rule" and "${four.total} behaviours, ${four.breaking.length} break a rule".`,
    `Press Try every decision rule at 3 generals: ${rules3.survivors.length} of ${rules3.rules} satisfy both rules. At 4 generals: ${rules4.survivors.length} of ${integer(rules4.rules)}, the majority rule.`,
    `Open Signatures change the game at ${SIGNED_N} generals: with L1 as the traitor, a loyal attack order and an oral relay of 0, the oral column breaks IC2 and the signed column holds. Then make the Commander the traitor, signing attack for L1 and retreat for L2: both lieutenants hold both signed orders and retreat together.`,
  ],
  keyIdeas: [
    `A third general cannot save oral messages: a loyal lieutenant that holds one order and one contradicting relay cannot tell the liar, and ${three.breaking.length} of ${three.total} traitor behaviours break a rule at three generals against ${four.breaking.length} of ${four.total} at four.`,
    'Quorums of size n - f overlap in at least n - 2f nodes. At n = 3f + 1 that is more than the f possible traitors, so a loyal node sits in the overlap; at n = 3f the whole overlap may be traitors. That bound is argued here, not run.',
    'Signatures do not stop a traitor from lying about what it saw, but a traitor cannot alter a signed order, so equivocation shows up and three generals suffice in the modelled signed scene, which assumes synchronous rounds.',
    'A bounded check says what it covered: each behaviour at three and four generals with one traitor and binary values, and 200 sampled runs of OM(2) at six and seven. Neither says what holds for other sizes or other lies.',
  ],
  quiz: [
    {
      q: 'Why is one traitor among three generals not tolerable with oral messages?',
      options: [
        'A loyal lieutenant cannot tell which of the other two is lying',
        'Two of three is not a majority, so no vote can be taken at all',
        'The traitor can block every message the others try to send',
        'Oral messages are lost more often than signed ones in a network',
      ],
      answer: 0,
      why: 'A loyal lieutenant holds the commander\'s order and one relay. If they differ it cannot tell whether the commander or the other lieutenant lied, so the tie rule can overrule a loyal commander. Blocking or loss is a different failure from lying.',
    },
    {
      q: 'What do signatures change in the signed scene?',
      options: [
        'They make messages arrive on time, so rounds can be shorter',
        'They stop a lieutenant from withholding a relay it received',
        'They let a general check the commander\'s identity by guessing',
        'A traitor cannot alter an order, and equivocation shows up',
      ],
      answer: 3,
      why: 'A traitor commander can still sign two different orders, but a lieutenant that holds both knows the commander equivocated and retreats. Withholding a relay stays possible, and the scene assumes synchronous rounds.',
    },
    {
      q: 'Quorums of size n - f among n = 3f + 1 nodes overlap in at least f + 1 nodes. Why does that help?',
      options: [
        'Each overlap holds a loyal node, so two quorums cannot diverge',
        'A bigger overlap makes messages travel faster between quorums',
        'The overlap nodes vote twice, which breaks any tie between quorums',
        'With f + 1 nodes in the overlap no traitor is left in the cluster',
      ],
      answer: 0,
      why: 'With f traitors or fewer, f + 1 shared nodes include at least one loyal node, and a loyal node tells both quorums the same thing. The traitors are still in the cluster.',
    },
    {
      q: 'The search says "32 behaviours, 0 break a rule" at n = 4. What does that cover?',
      options: [
        'Every cluster size, since a bigger n only adds loyal votes',
        'This model: one traitor, binary values, OM(1) and four generals',
        'Only the behaviours that the learner happened to try by hand',
        'All protocols, since the traitor tried everything that is possible',
      ],
      answer: 1,
      why: 'An exhaustive run covers each behaviour inside its bounds, which here are one traitor, two values, one relay round and four generals. It says nothing about other sizes or other protocols.',
    },
    {
      q: 'At n = 3 with OM(1) and a retreat default, how many of the 12 traitor behaviours break a rule?',
      options: [
        'None, because two loyal generals out-vote one traitor at n = 3',
        '6, which is the half where the traitor is a lieutenant',
        '12, since any lie at all breaks agreement among the loyal',
        '2: the lieutenant-traitor cases with order 1 and relay 0',
      ],
      answer: 3,
      why: 'A lie breaks a rule when the loyal commander orders attack and the traitor lieutenant relays retreat, because the tie then goes to retreat. That is L1 or L2 as the traitor: 2 of 12. A relay of retreat for a retreat order breaks nothing.',
    },
  ],
};

export default lesson;
