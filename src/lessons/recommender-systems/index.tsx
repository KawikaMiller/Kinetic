import type { LessonModule } from '../../core/types';
import { rmse2 } from './captions';
import { FILM_TITLES } from './data';
import { factoriseFacts, funnelFacts, loopFacts, matrixFacts, neighbourFacts } from './facts';
import { CANDIDATES, SHOWN } from './funnel';
import { EXPLORATION, ROUNDS } from './loop';
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
    what: 'Most cells of a ratings matrix are empty. Matrix factorisation learns a short vector per user and per film so that their dot product approximates the observed ratings, then predicts the blanks. With few ratings and many factors it memorises the ones it has and gets worse on the rest. A neighbour method asks which users rated alike instead, and fails where users share few films. Serving is a funnel (candidates by dot product, then a ranker with extra features), and because users rate only what they are shown, a system that recommends the already liked films concentrates exposure unless it explores.',
    analogy: 'A shop assistant who has seen only a few of your purchases guesses your taste from what similar customers bought, and then arranges the shelf, so what you see next is partly their guess coming true.',
    useCases: [
      'Film, music and product recommendations',
      'Filling missing ratings or interactions in a sparse table',
      'Choosing how many latent factors and how much regularisation a model needs',
      'Deciding how much a recommender should explore instead of repeating itself',
    ],
    why: 'A recommender is a model plus a loop: its error on unseen ratings, its behaviour for a user with no history and the exposure it gives to items are all engineering outcomes you can measure and tune, not properties of an algorithm that knows what people like.',
    watch:
      'The matrix: blue cells are observed ratings (deeper blue for higher), an outline in grey is a rating you hid, violet cells are predictions, and with the truth shown a prediction turns green when it is within half a point, red when it is off by one and a half or more and orange between. Curves: blue is training error, violet held-out error, the yellow rule your epoch. Funnel: blue for candidates, violet for the ranker, yellow for the films shown. Loop: red is no exploration, green ten percent, blue bars are impressions per film.',
  },
  tryThis: [
    `In "The matrix", ${matrix.train} of the 180 cells have a rating and ${matrix.test} are held out. Click the rating at U${matrix.hiddenOne.cell[0] + 1}, F${matrix.hiddenOne.cell[1] + 1}: the model sees ${matrix.hiddenOne.train} ratings and ${matrix.hiddenOne.test} cells are held out. Set New user rates to ${MATRIX_DEFAULT.rateAs} and click F1 in the bottom row to give a brand-new user a first rating.`,
    `In "Factorise it", 6 factors with no regularisation drive training RMSE to ${rmse2(fac.over.train[fac.epochs])} while held-out RMSE, lowest at ${rmse2(fac.over.test[fac.over.bestEpoch])} at epoch ${fac.over.bestEpoch}, has risen to ${rmse2(fac.over.test[fac.epochs])}. Set Latent factors to 2 and Regularisation to 0.02: held-out RMSE ${rmse2(fac.small.test[fac.epochs])}.`,
    `In "Neighbours instead", a minimum overlap of ${NEIGHBOUR_DEFAULT.minOverlap} films gives held-out RMSE ${rmse2(nb.open.rmse)} with ${pctOf(nb.open.coverage)} of cells covered, against ${rmse2(nb.mf)} for the factorisation. Raise it to 5: ${pctOf(nb.strict.coverage)} of cells are covered.`,
    `In "The funnel", user ${FUNNEL_DEFAULT.user + 1} is shown ${names(funnel.plain)} with no weight on popularity. Set Weight on popularity to 100%: ${names(funnel.popular)}.`,
    `In "The feedback loop", with no exploration the exposure Gini is ${loop.giniOff.toFixed(2)} and the top three films take ${pctOf(loop.topOff)} of impressions. Switch Exploration to 10%: Gini ${loop.giniOn.toFixed(2)} and ${pctOf(loop.topOn)}.`,
  ],
  keyIdeas: [
    'With few observed ratings and many latent factors, training error can keep falling while error on unseen ratings rises, so held-out error, not training error, picks the model.',
    'A user with no ratings has nothing to separate them from the average, so in this model a factorisation predicts roughly the mean rating for them: the cold start problem.',
    'A neighbour method needs users who share rated films, so a higher minimum overlap leaves more cells with no neighbour and pushes predictions back to the mean.',
    'Users rate what they are shown, so a system that shows the already liked films concentrates exposure, and random slots are what let other films be discovered.',
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
      why: `At 6 factors and no regularisation training RMSE falls to ${rmse2(fac.over.train[fac.epochs])} while held-out RMSE goes from its lowest ${rmse2(fac.over.test[fac.over.bestEpoch])} (epoch ${fac.over.bestEpoch}) up to ${rmse2(fac.over.test[fac.epochs])}. Two factors with a little regularisation reach ${rmse2(fac.small.test[fac.epochs])}.`,
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
      why: `A user with no ratings keeps their small starting factors, so p . q stays near 0 and each prediction is within ${fac.coldSpread.toFixed(2)} of the mean rating, against up to ${fac.warmSpread.toFixed(2)} for a user with history. The algorithm does not know what the new user likes.`,
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
      why: `Coverage falls from ${pctOf(nb.open.coverage)} to ${pctOf(nb.strict.coverage)} of held-out cells and neighbour RMSE goes from ${rmse2(nb.open.rmse)} to ${rmse2(nb.strict.rmse)}, against ${rmse2(nb.mf)} for the factorisation in this model.`,
    },
    {
      q: 'Why does a system that shows the films with the most likes concentrate exposure on a few films?',
      options: [
        'Users rate only what they are shown, so shown films collect likes and the rest cannot catch up without random slots',
        'The most-liked films are always the best films, so every user should be shown the same few titles for as long as they are liked',
        'Users dislike unfamiliar films, so a film shown for the first time is rated lower than the leaders',
        'The ranker lowers the score of a film each time it is shown, which pushes the same few to the top',
      ],
      answer: 0,
      why: `After ${ROUNDS} rounds with no exploration the exposure Gini is ${loop.giniOff.toFixed(2)} and the top three films take ${pctOf(loop.topOff)} of impressions; with ${pctOf(EXPLORATION)} random slots it is ${loop.giniOn.toFixed(2)}. The leaders were set by early chance, not by quality.`,
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
