import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'In a simultaneous game each player picks a strategy without seeing the other, and an equilibrium is a combination where neither can gain by changing just their own choice; it need not be the best outcome for either.',
    what: `Put the two players' options in a payoff matrix: Row picks a line, Column picks a column, and each cell holds both payoffs. A strategy is strictly dominated if another is strictly better against each reply. A cell is a pure equilibrium (a Nash equilibrium) when neither player has a strictly better reply to the other's choice. Some games have none in pure strategies, like matching pennies, but a player can also mix: playing each option with a chosen probability so that the opponent is left indifferent between theirs. The lesson assumes two players, simultaneous moves and complete information, uses invented whole-number payoffs, and checks its claims on all ${F.total} small 2 x 2 games; the general existence result is a named theorem.`,
    analogy: 'Two drivers meeting at a narrow bridge each deciding whether to push on: neither wants to be the one who yields, yet if both push the result is worse for both than if one had held back.',
    useCases: [
      'Reasoning about pricing, bidding and competition, where each side reacts to what the other is likely to do',
      'Spotting social dilemmas in engineering teams and shared infrastructure, where each locally sensible choice makes the group worse off',
      'Designing rules and incentives so that the stable outcome is also a good one, the starting point of mechanism design',
      'Randomised strategies in security and testing, where being predictable is the weakness',
    ],
    why: 'A system with several decision makers settles where nobody wants to move alone, not where the total is best, and knowing the difference explains many stuck situations. It builds on `expected-value` (mixed strategies are expected payoffs), `probability-basics` and `game-tree-search` (the sequential cousin of this simultaneous game).',
    watch: 'Each matrix cell reads Row\'s payoff, then Column\'s. A blue dot in a cell is Row\'s best reply in that column and a violet dot is Column\'s best reply in that row; a cell with both is an equilibrium and is tinted green. A crossed-out strategy is strictly dominated. In the mixed scene the two plot lines are the expected payoffs of a player\'s two strategies, blue-green for the first and pink for the second, and the green point is where they cross. In the enumeration scene a green bar counts games and a red bar counts them under the broken finder.',
  },
  tryThis: [
    `In The matrix, on the default prisoner's dilemma, click the cell (Cooperate, Cooperate): it is refused, "Row gains by switching to Defect (-1 becomes 0)".`,
    `Click (Defect, Defect): it is accepted, and the message gives what each player would get by switching, -3 against -2.`,
    `Press Matching pennies, then Declare: no pure equilibrium: it is refused, the mixed equilibrium (${F.mpP}, ${F.mpP}) being shown.`,
    `Press Battle of the sexes in The matrix: ${F.bosPure} cells light up. Open Mixed strategies and press Battle of the sexes there: p = ${F.bosP} and q = ${F.bosQ}.`,
    `Open Does every game have one?: ${F.noPure} of the ${F.total} games have no pure equilibrium, and ${F.mixedValid} of them have a mixed one.`,
  ],
  keyIdeas: [
    `An equilibrium is stable, not best: (Defect, Defect) is the one equilibrium of the prisoner's dilemma, paying -2 each where (Cooperate, Cooperate) would pay -1 each.`,
    `A mixed equilibrium leaves the opponent indifferent: in battle of the sexes Row plays opera with probability ${F.bosP} and Column with ${F.bosQ}, and each player earns ${F.bosValue} on average.`,
    `All ${F.total} games with payoffs 0 to 3 were checked: ${F.noPure} have no pure equilibrium and each of them has a valid mixed one, while the claim for every finite game is a theorem (Nash) that is named here, not proved.`,
    `A finder that looks at Row's deviations alone calls (Defect, Cooperate) an equilibrium and is wrong on ${F.brokenDiffers} of ${F.total} games (${F.brokenPercent}%).`,
  ],
  quiz: [
    {
      q: 'Why is (Defect, Defect) the equilibrium of the prisoner\'s dilemma although (Cooperate, Cooperate) pays both players more?',
      options: [
        'Because players cannot see each other\'s choice and so must guess blindly',
        'Neither player gains by switching alone; defecting beats cooperating either way',
        'Because mutual cooperation is not a feasible outcome of the game as stated',
        'Because defecting has the higher average payoff over both possible outcomes',
      ],
      answer: 1,
      why: `Against a cooperator, defecting pays 0 instead of -1; against a defector it pays -2 instead of -3. That makes defecting strictly better against both replies, so (Defect, Defect) is the equilibrium, even though both would prefer -1 each to -2 each.`,
    },
    {
      q: 'Which statement about a Nash equilibrium is accurate?',
      options: [
        'No player can improve their own payoff by changing only their own strategy',
        'It is the outcome with the highest total payoff summed over all players',
        'It is always unique in a finite game between two players, like a fixed point',
        'It requires the players to agree on it with each other before they play',
      ],
      answer: 0,
      why: `The definition is about single deviations, not totals or agreements: battle of the sexes has ${F.bosPure} pure equilibria, so uniqueness fails, and (Defect, Defect) is one although it is not the best total.`,
    },
    {
      q: 'Matching pennies has no pure equilibrium. What is its equilibrium?',
      options: [
        'Both players pick heads, because the payoff there is highest for the matcher',
        'The game has no equilibrium of any kind, since no pure one exists',
        'Each player copies the option the opponent picked on the previous turn',
        'Each player picks heads with probability one half, which leaves the other indifferent',
      ],
      answer: 3,
      why: `Against a one-half mix each pure reply earns 0, so neither player can gain by changing their mix: p = q = ${F.mpP}. The theorem says a mixed equilibrium exists for every finite game, which is why "none" is wrong.`,
    },
    {
      q: 'In battle of the sexes, how many pure equilibria does the lesson find?',
      options: [
        'One: the single pair of choices with the highest total payoff to the two players',
        'None: the two players prefer different cells, so no cell is ever stable',
        'Two: both at the opera or both at football, where neither gains by moving alone',
        'Four: every cell is stable once each player has made their own choice',
      ],
      answer: 2,
      why: `At (Opera, Opera) and (Football, Football) a player who moves alone ends up at a mismatched cell and earns 0, so ${F.bosPure} cells are stable. The two mismatched cells fail: either player gains by switching.`,
    },
    {
      q: 'In battle of the sexes (opera pays 2 to the row player, football pays 1), with what probability does the row player pick opera in the mixed equilibrium?',
      options: [
        'One third, which is the mirror image of the column player\'s own mix',
        'Two thirds, which leaves the column player indifferent',
        'One half, so that the two choices are treated in a symmetric way',
        'Three quarters, the same figure as in the stag hunt game',
      ],
      answer: 1,
      why: `The column player's payoffs are 1 for matching at opera and 2 at football, so Row has to play opera with p = (2 - 0) / (1 - 0 - 0 + 2) = ${F.bosP} to leave Column indifferent; Column's own mix is ${F.bosQ}.`,
    },
  ],
};

export default lesson;
