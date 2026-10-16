import type { LessonModule } from '../../core/types';
import { rmse2 } from './captions';
import { FILM_TITLES } from './data';
import { factoriseFacts, funnelFacts, loopFacts, matrixFacts, neighbourFacts } from './facts';
import { CANDIDATES, SHOWN } from './funnel';
import { EXPLORATION, ROUNDS } from './loop';
import { PINNED_LOOP_SEEDS } from './loopSeeds';
import { FUNNEL_DEFAULT, MATRIX_DEFAULT, NEIGHBOUR_DEFAULT } from './settings';
import { Stage } from './Stage';

const matrix = matrixFacts();
const fac = factoriseFacts();
const nb = neighbourFacts();
const funnel = funnelFacts();
const loop = loopFacts();
const names = (items: readonly number[]) => items.slice(0, SHOWN).map((i) => FILM_TITLES[i]).join(', ');
const pctOf = (v: number) => `${Math.round(v * 100)}%`;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A recommender fills the gaps in a users-by-items ratings matrix by learning a few hidden factors, then a cheap first stage narrows the catalogue and a ranker picks what to show, and what gets shown shapes what gets rated next.',
    what: 'Most cells of a ratings matrix are empty. Matrix factorisation learns a short vector per user and per film so that their dot product approximates the observed ratings, then predicts the blanks. With few ratings and too much fitting capacity (many epochs, no penalty, and sometimes more factors) it memorises the ones it has and gets worse on the rest, and a penalty on the factors is what holds it back. A neighbour method asks which users rated alike instead, and fails where users share few films. Serving is a funnel (candidates by dot product, then a ranker with extra features), and because users rate only what they are shown, a system that draws films in proportion to their likes concentrates exposure more than the appeal of the films explains, and random slots only soften that.',
    analogy: 'A shop assistant who has seen only a few of your purchases guesses your taste from what similar customers bought, and then arranges the shelf, so what you see next is partly their guess coming true.',
    useCases: [
      'Film, music and product recommendations',
      'Filling missing ratings or interactions in a sparse table',
      'Choosing how many latent factors and how much regularisation a model needs',
      'Deciding how much a recommender should explore instead of repeating itself',
    ],
    why: 'A recommender is a model plus a loop: its error on unseen ratings, its behaviour for a user with no history and the exposure it gives to items are all engineering outcomes you can measure and tune, not properties of an algorithm that knows what people like.',
    watch:
      'The matrix: blue cells are observed ratings (deeper blue for higher), an outline in grey is a rating you hid, violet cells are predictions, and with the truth shown a prediction turns green when it is within half a point, red when it is off by one and a half or more and orange between. Curves: blue is training error, violet held-out error, the yellow rule your epoch. Funnel: blue for candidates, violet for the ranker, yellow for the films shown. Loop: the red curve is the exposure Gini of the loop, the dashed violet curve the same rule with no feedback, blue bars the impressions per film in the loop and violet dots the no-feedback impressions.',
  },
  tryThis: [
    `In "The matrix", ${matrix.train} of the 180 cells have a rating and ${matrix.test} are held out. Click the rating at U${matrix.hiddenOne.cell[0] + 1}, F${matrix.hiddenOne.cell[1] + 1}: the model sees ${matrix.hiddenOne.train} ratings and ${matrix.hiddenOne.test} cells are held out. Set New user rates to ${MATRIX_DEFAULT.rateAs} and click F1 in the bottom row to give a brand-new user a first rating.`,
    `In "Factorise it" (press Reset my edits first if the strip shows edits), 6 factors with no regularisation drive training RMSE to ${rmse2(fac.over.train[fac.epochs])} while held-out RMSE, lowest at ${rmse2(fac.over.test[fac.over.bestEpoch])} at epoch ${fac.over.bestEpoch}, has risen to ${rmse2(fac.over.test[fac.epochs])}. First set Regularisation to 0.02 and leave the factors at 6: held-out RMSE ${rmse2(fac.penalised.test[fac.epochs])}. Then put Regularisation back to 0 and set Latent factors to 2: it still rises, from ${rmse2(fac.twoNoPenalty.test[fac.twoNoPenalty.bestEpoch])} at epoch ${fac.twoNoPenalty.bestEpoch} to ${rmse2(fac.twoNoPenalty.test[fac.epochs])}. The penalty, not fewer factors, is what stops it.`,
    `In "Neighbours instead" (press Reset my edits first if the strip shows edits), a minimum overlap of ${NEIGHBOUR_DEFAULT.minOverlap} films gives held-out RMSE ${rmse2(nb.open.rmse)} with ${pctOf(nb.open.coverage)} of cells covered, against ${rmse2(nb.mf)} for the factorisation and ${rmse2(nb.baseline)} for just predicting the overall mean. Raise it to 5: ${pctOf(nb.strict.coverage)} of cells are covered.`,
    `In "The funnel", user ${FUNNEL_DEFAULT.user + 1} is shown ${names(funnel.plain)} with no weight on popularity. Set Weight on popularity to 100%: ${names(funnel.popular)}.`,
    `In "The feedback loop", with no exploration the exposure Gini is ${loop.giniOff.toFixed(2)}, against ${loop.giniFree.toFixed(2)} for the same rule told every user's true likes, and the loop shows ${FILM_TITLES[loop.topFilmOff]} most where no feedback would show ${FILM_TITLES[loop.topFilmFree]}. Switch Exploration to 10%: Gini ${loop.giniOn.toFixed(2)}. Change the seed: the loop's Gini is higher on ${PINNED_LOOP_SEEDS.giniHigher} of ${PINNED_LOOP_SEEDS.streams} seeds and a different film is shown most on ${PINNED_LOOP_SEEDS.winnerDiffers}.`,
  ],
  keyIdeas: [
    'With few observed ratings, training error can keep falling while error on unseen ratings rises, whether from many epochs, no penalty or even a few factors, so held-out error, not training error, picks the model and regularisation is what holds the fitting back.',
    'A user with no ratings has nothing to separate them from the average, so in this model a factorisation predicts roughly the mean rating for them: the cold start problem.',
    'A neighbour method needs users who share rated films, so a higher minimum overlap leaves more cells with no neighbour and pushes predictions back to the mean.',
    `Users rate what they are shown, so a rule that draws films in proportion to their likes concentrates exposure more than the same rule fed the users' true likes (Gini ${loop.giniOff.toFixed(2)} against ${loop.giniFree.toFixed(2)}) and early luck helps decide the winners; random slots soften this (${loop.giniOn.toFixed(2)}) but do not remove it.`,
  ],
  quiz: [
    {
      q: 'A factorisation has many factors, few observed ratings and a training error near zero. What will the held-out error do?',
      options: [
        'It stops improving and then rises, because the factors have fitted the noise in the few ratings they saw',
        'It falls along with the training error, since a model that fits the ratings it has fits unseen ones as well',
        'It stays flat, because held-out cells are predicted from the mean and never from the learned factors',
        'It falls faster than the training error, since extra factors add information about the unseen cells',
      ],
      answer: 0,
      why: `At 6 factors and no regularisation training RMSE falls to ${rmse2(fac.over.train[fac.epochs])} while held-out RMSE goes from its lowest ${rmse2(fac.over.test[fac.over.bestEpoch])} (epoch ${fac.over.bestEpoch}) up to ${rmse2(fac.over.test[fac.epochs])}. A penalty of 0.02 brings the same 6 factors to ${rmse2(fac.penalised.test[fac.epochs])}, while 2 factors with no penalty still rise, from ${rmse2(fac.twoNoPenalty.test[fac.twoNoPenalty.bestEpoch])} to ${rmse2(fac.twoNoPenalty.test[fac.epochs])}.`,
    },
    {
      q: 'A brand-new user has rated nothing. What does the trained factorisation predict for them?',
      options: [
        'About the average rating for every film, because nothing about them separates one film from another',
        'Their true favourites, since the film factors already encode which films everyone tends to like best',
        'A rating of zero for every film, because a user with no ratings has no factors to multiply with',
        'The ratings of the most similar existing user, which the model finds by comparing their histories',
      ],
      answer: 0,
      why: `In the 2-factor model with regularisation 0.02 (the one the Neighbours and Funnel scenes use) a user with no ratings has factors the penalty pulls to zero, so p . q is 0 and each prediction is the mean rating (largest gap from it ${fac.coldSpread.toFixed(2)}), against up to ${fac.warmSpread.toFixed(2)} for a user with history. With no penalty, as in the default Factorise scene, the small starting factors stay and the largest gap is ${fac.coldSpreadDefault.toFixed(2)}. Either way the algorithm does not know what the new user likes.`,
    },
    {
      q: 'The minimum overlap for neighbours is raised from 2 films to 5. What happens?',
      options: [
        'Fewer held-out cells have a neighbour, so more predictions fall back to the user\'s mean and the error rises',
        'The neighbours become more similar and so the error falls, since a stricter overlap removes poor matches from the list',
        'Nothing changes for cells that already had a neighbour, and no cell loses its neighbour at all',
        'The factorisation takes over the missing cells, because both methods share one set of predictions',
      ],
      answer: 0,
      why: `Coverage falls from ${pctOf(nb.open.coverage)} to ${pctOf(nb.strict.coverage)} of held-out cells and neighbour RMSE goes from ${rmse2(nb.open.rmse)} to ${rmse2(nb.strict.rmse)}, against ${rmse2(nb.mf)} for the factorisation and ${rmse2(nb.baseline)} for predicting the overall mean in this model.`,
    },
    {
      q: 'A system draws films in proportion to the likes they have collected, and users can rate only what they are shown. Compared with the same rule told the true likes of every user, what does that feedback do?',
      options: [
        'It concentrates exposure more, and early luck in who was shown and liked a film helps decide which films win',
        'It spreads exposure out more evenly, because every film is shown until it has been rated by every user',
        'It makes no difference to exposure, because the rule is the same and a like is a like whoever collected it',
        'It always puts the best-liked films on top, since a like can only come from a film users enjoy',
      ],
      answer: 0,
      why: `In this model, after ${ROUNDS} rounds with no exploration the exposure Gini is ${loop.giniOff.toFixed(2)} against ${loop.giniFree.toFixed(2)} for the same rule told the true likes of the users, and it is higher on ${PINNED_LOOP_SEEDS.giniHigher} of ${PINNED_LOOP_SEEDS.streams} seeds. A different film gets the top spot on ${PINNED_LOOP_SEEDS.winnerDiffers} of them, so the winners are partly luck. With ${pctOf(EXPLORATION)} random slots the Gini is ${loop.giniOn.toFixed(2)}: lower, not gone.`,
    },
    {
      q: `A catalogue is large, so the system takes the best ${CANDIDATES} by dot product and only then runs a ranker. Why two stages?`,
      options: [
        'A cheap score narrows the catalogue so a costlier ranker with extra features only scores a short list',
        'The ranker cannot read the learned factors, so a first stage must translate them into a list for it in time',
        'Two stages make the final order independent of the model, which removes the effect of popularity',
        'Dot products are inaccurate, so the second stage exists to correct every mistake the first one made',
      ],
      answer: 0,
      why: `Here ${CANDIDATES} candidates go to the ranker and ${SHOWN} are shown; moving the popularity weight to 100% changes the shown films from ${names(funnel.plain)} to ${names(funnel.popular)}. The sizes are scaled down: a real catalogue is far larger, which is the reason for two stages.`,
    },
  ],
};

export default lesson;
