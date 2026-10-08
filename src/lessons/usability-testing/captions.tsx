import type { ReactNode } from 'react';
import { ELEMENTS, nielsenLandauer, type MethodResults, type Session, type Step } from './model';

export const sessionsIntro = (
  <>
    A fictional checkout with three planted problems, and simulated participants who try to buy the blue mug. Play a replay, add participants, and watch which problems each one finds.
  </>
);

/** What one step of a replay shows, in words. Honest about a session someone biased. */
export function stepCaption(step: Step, session: Session): ReactNode {
  const name = ELEMENTS[step.element].label;
  const leading = session.contaminated.includes('leading');
  switch (step.kind) {
    case 'click':
      return <>Clicks <b>{name}</b> after {step.t} s.</>;
    case 'hesitate':
      if (step.speaker === 'facilitator') {
        return <>Hesitates over <b>{name}</b>. The facilitator steps in: “{step.say}” <span className="hl orange wrap">a helped session</span></>;
      }
      return leading ? (
        <>Hesitates over <b>{name}</b>, but after a leading question says “{step.say}” <span className="hl orange wrap">the real problem goes unspoken</span></>
      ) : (
        <>Hesitates over <b>{name}</b>, thinking aloud: “{step.say}”</>
      );
    case 'error':
      if (step.speaker === 'facilitator') return <>Types a card number into the <b>{name}</b> box. The facilitator steps in: “{step.say}” <span className="hl orange wrap">a helped session</span></>;
      if (step.say && leading) return <>Types a card number into the <b>{name}</b> box, but after a leading question says “{step.say}” <span className="hl orange wrap">the real problem goes unspoken</span></>;
      return step.say ? <>Types a card number into the <b>{name}</b> box, thinking aloud: “{step.say}”</> : <>Clicks <b>{name}</b> by mistake: nothing useful happens.</>;
    case 'backtrack':
      return <>Backs out and returns to <b>{name}</b>.</>;
    case 'giveup':
      return <>Gives up at <b>{name}</b> after {step.t} s: <span className="hl bad">task failed</span></>;
    case 'done':
      return session.wouldHaveGivenUp ? (
        <>Buys the mug in {step.t} s, but this participant would have given up without the bias: <span className="hl orange wrap">an inflated success</span></>
      ) : (
        <>Buys the mug in {step.t} s: <span className="hl ok">task done</span></>
      );
  }
}

export function curveCaption(l: number, n: number, found: number, total: number): ReactNode {
  const share = Math.round(nielsenLandauer(l, n) * 100);
  return (
    <>
      With L = {l}, the model says {n} {n === 1 ? 'participant finds' : 'participants find'} about {share}% of the problems. This test found {found} of {total}.
    </>
  );
}

export function methodCaption(method: 'survey' | 'analytics' | 'test', r: MethodResults): ReactNode {
  if (method === 'survey') {
    return <>{r.surveyYes} of {r.n} said the coupon box was easy to find. That is what they said; a survey cannot tell you what they did.</>;
  }
  if (method === 'analytics') {
    return (
      <>
        The coupon box was clicked in {r.couponClicks} of {r.n} sessions and {r.paid} paid. Analytics shows what happened, not why anyone clicked there.
      </>
    );
  }
  return r.quotes.length ? (
    <>
      {r.quotes.length} of {r.n} participants typed a card number into the coupon box. Watching them think aloud says why: “{r.quotes[0].say}”
    </>
  ) : (
    <>Nobody in this run met the coupon box, so the test learns nothing about it: that is the cost of a small sample.</>
  );
}
