/** Captions: every number from the model on screen. Plain strings, so tests can read them. */
import { plural } from '../../core/format';
import { FILM_TITLES, ITEMS, USERS } from './data';
import { CANDIDATES, SHOWN } from './funnel';
import type { MfConfig, MfRun } from './mf';
import type { NeighbourScore } from './neighbours';
import { NEW_USER, type Problem } from './problem';

export const rmse2 = (v: number) => v.toFixed(2);

export function matrixCaption(p: Problem): string {
  const cells = USERS * ITEMS;
  const hidden = p.edits.hidden.length;
  const coldCount = Object.keys(p.edits.newUser).length;
  const cold = coldCount === 0 ? 'The new user has no ratings yet: nothing is known about them (cold start).' : `The new user has rated ${plural(coldCount, 'film')}.`;
  return `${p.train.length - coldCount} of the ${cells} cells have a rating (${Math.round(((p.train.length - coldCount) / cells) * 100)}%) and ${p.test.length} are held out, ${hidden === 0 ? 'none of them hidden by you' : `${hidden} of them hidden by you`}. ${cold}`;
}

export function factoriseCaption(run: MfRun, cfg: MfConfig): string {
  const e = cfg.epochs;
  const head = `${plural(cfg.factors, 'factor')}, lambda ${cfg.lambda.toFixed(2)}, ${plural(e, 'epoch')}: training RMSE ${rmse2(run.train[e])}, held-out RMSE ${rmse2(run.test[e])}.`;
  const rise = run.test[e] - run.test[run.bestEpoch];
  if (e === 0) return `${head} Before any training every prediction is the mean rating.`;
  if (rise > 0.02) {
    return `${head} Held-out error was lowest at epoch ${run.bestEpoch} (${rmse2(run.test[run.bestEpoch])}) and has risen by ${rmse2(rise)} since, while training error kept falling: overfitting.`;
  }
  return `${head} Held-out error is ${run.bestEpoch === e ? 'at its lowest so far' : `within ${rmse2(rise)} of its lowest, ${rmse2(run.test[run.bestEpoch])} at epoch ${run.bestEpoch}`}.`;
}

export function neighbourCaption(score: NeighbourScore, mf: number, minOverlap: number): string {
  return `Neighbours who share at least ${plural(minOverlap, 'film')}: held-out RMSE ${rmse2(score.rmse)} and ${Math.round(score.coverage * 100)}% of held-out cells have a neighbour who rated the film (the rest use the user's mean). The factorisation scores ${rmse2(mf)} on the same cells.`;
}

export function funnelCaption(user: number, shown: readonly number[], plain: readonly number[], weightPct: number): string {
  const names = shown.slice(0, SHOWN).map((i) => FILM_TITLES[i]).join(', ');
  const moved = shown.slice(0, SHOWN).filter((i) => !plain.slice(0, SHOWN).includes(i)).length;
  const change = weightPct === 0 ? 'The ranker ignores popularity, so the order is the model\'s.' : moved === 0 ? 'The same three films as with no weight on popularity.' : `${plural(moved, 'film')} changed against no weight on popularity.`;
  return `User ${user + 1}: the ${CANDIDATES} best of the unrated films by dot product go to the ranker, which weights popularity and freshness at ${weightPct}%, and the top ${SHOWN} are shown: ${names}. ${change}`;
}

export function loopCaption(exploration: boolean, giniSelected: number, giniOther: number, topShare: number, rounds: number): string {
  return `After ${rounds} rounds ${exploration ? 'with 10% random exploration' : 'with no exploration'} the exposure Gini is ${giniSelected.toFixed(2)} (${exploration ? 'no exploration' : '10% exploration'}: ${giniOther.toFixed(2)}), and the top three films take ${Math.round(topShare * 100)}% of all impressions.`;
}

export const newUserLabel = `User ${NEW_USER + 1} (new)`;
