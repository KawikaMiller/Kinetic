import type { PrincipleId } from './acm';

/**
 * harm to people; a risk that was raised and addressed (`handled`: use it only where a risk is dealt with);
 * a benefit or a cost saved, including doing nothing (`benefit`); or a trade-off that stays open.
 * Authored, never computed.
 */
export type ImpactTone = 'harm' | 'handled' | 'benefit' | 'open';

export interface Impact {
  tone: ImpactTone;
  text: string;
}

export interface Choice {
  id: 'A' | 'B' | 'C';
  label: string;
  /** The node this choice leads to. No two choices of one decision share a target. */
  to: string;
  users: Impact;
  team: Impact;
  you: Impact;
  /** Therac-25 only: the choice that matches what actually happened. The consequences on its cards are still authored. */
  history?: boolean;
}

/** What the outcome panel says about where a choice's consequences come from. */
export function choiceBasis(c: { fictional: boolean }, choice: Pick<Choice, 'history'>): string {
  if (c.fictional) return 'Illustrative consequences, not predictions';
  return choice.history
    ? 'This choice matches what happened; the consequences below are written for this lesson, not taken from the reports'
    : 'A what-if written for this lesson, not what happened';
}

export interface Decision {
  kind: 'decision';
  id: string;
  /** The map's label. */
  short: string;
  title: string;
  setup: string;
  principles: readonly PrincipleId[];
  choices: readonly Choice[];
}

/** What an end card is built on: history, a what-if on history, or a fictional illustration. */
export type EndBasis = 'history' | 'what-if' | 'illustrative';

export interface Ending {
  kind: 'end';
  id: string;
  short: string;
  title: string;
  basis: EndBasis;
  text: string;
  /** A question to carry away, never a grade. */
  question: string;
}

export type CaseNode = Decision | Ending;

export interface EthicsCase {
  id: string;
  title: string;
  subtitle: string;
  fictional: boolean;
  /** The sentence that frames the case, including its honesty label. */
  honesty: string;
  start: string;
  nodes: readonly CaseNode[];
}

const h = (text: string): Impact => ({ tone: 'harm', text });
const ok = (text: string): Impact => ({ tone: 'handled', text });
const gain = (text: string): Impact => ({ tone: 'benefit', text });
const open = (text: string): Impact => ({ tone: 'open', text });

/** The facts the Therac-25 case rests on (Leveson & Turner, "An Investigation of the Therac-25 Accidents", IEEE Computer, 1993). */
export const THERAC_FACTS = {
  source: 'Leveson & Turner, "An Investigation of the Therac-25 Accidents", IEEE Computer, 1993',
  knownAccidents: 6,
  firstAccident: { month: 'June', year: 1985 },
  lastAccident: { month: 'January', year: 1987 },
} as const;

const THERAC: EthicsCase = {
  id: 'therac',
  title: 'Therac-25',
  subtitle: 'History, 1985-87',
  fictional: false,
  honesty: `History, summarised from ${THERAC_FACTS.source}. The Therac-25 was a computer-controlled radiation therapy machine. Between June 1985 and January 1987 there were six known accidents in which patients received massive radiation overdoses, with deaths and serious injuries. You play an engineer on the project; one choice at each point matches what happened, the others are what-ifs. The consequences shown on the cards are written for this lesson, and the set-up is a simplification of a long chain of events.`,
  start: 'design',
  nodes: [
    {
      kind: 'decision', id: 'design', short: 'Design', title: 'Safety design',
      setup: 'The earlier model protected patients with independent hardware interlocks as well as software. The new design reuses much of the older software and relies on software checks for the same protections. What do you push for?',
      principles: ['2.5', '1.2'],
      choices: [
        {
          id: 'A', label: 'Rely on the software checks; drop the hardware interlocks', to: 'testing', history: true,
          users: h('Nothing independent of the software stands between a software fault and the patient.'),
          team: open('Less to build, resting on the assumption that reused software is already safe.'),
          you: open('You take on an assumption that still needs checking.'),
        },
        {
          id: 'B', label: 'Keep an independent hardware interlock as a backstop', to: 'end-interlock',
          users: ok('A software fault now has a second, independent check to get past.'),
          team: open('More cost, and a harder conversation about effort.'),
          you: ok('You can point to a safety argument that does not rest on the software alone.'),
        },
        {
          id: 'C', label: 'Stay software-only, but ask for an independent review of the safety analysis first', to: 'end-review',
          users: open('A review may find the gap, but a review is not a safeguard inside the machine.'),
          team: open('Review time, and a decision about what to do with its findings.'),
          you: ok('You have raised the risk formally instead of assuming it away.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'testing', short: 'Testing', title: 'Timing faults and error messages',
      setup: 'The reports describe many warning signs, and this set-up is a simplification of them. Imagine odd failures when an operator edits the treatment entry quickly, and terse messages such as "MALFUNCTION 54" that the manual does not explain. Pressing a key lets treatment carry on. The timing fault is a race condition, the bug class from `race-conditions`. What do you push for?',
      principles: ['2.1', '2.5'],
      choices: [
        {
          id: 'A', label: 'Treat the messages as nuisance faults; operators can proceed', to: 'reports', history: true,
          users: h('A dangerous machine state can be reached with little warning, and carrying on is one keypress.'),
          team: open('Fewer interruptions to treatment sessions, and no redesign.'),
          you: open('The messages become part of the daily routine.'),
        },
        {
          id: 'B', label: 'Test timing deliberately, make errors say what is wrong, and block unsafe resume', to: 'end-testing',
          users: ok('More faults are found before patients meet them, and a message tells staff what to do.'),
          team: open('Extra test effort and some redesign of the operator interface.'),
          you: ok('You are acting on the risk you have seen, not waiting for it to be proven.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'reports', short: 'Reports', title: 'Reports from hospitals',
      setup: 'After an incident, hospital staff report an overdose. The manufacturer cannot reproduce the problem, and an early position is that the machine could not deliver such a dose. More reports arrive from other sites over time. What do you push for?',
      principles: ['1.2', '1.3', '2.5'],
      choices: [
        {
          id: 'A', label: 'Assume the machine is not at fault; check each report case by case', to: 'end-history', history: true,
          users: h('Other patients keep being treated on a machine that may have the same fault.'),
          team: open('No stop to service and no admission of a design problem yet.'),
          you: open('You stay aligned with the company position, against what the reports are saying.'),
        },
        {
          id: 'B', label: 'Treat each report as a possible safety incident: stop use, investigate the whole system, tell every site', to: 'end-stop',
          users: ok('Treatment pauses while the cause is found, and every site knows what to watch for.'),
          team: open('Machines out of service, cost, and a difficult conversation with customers.'),
          you: ok('You are acting on the evidence of the reports, and openly.'),
        },
        {
          id: 'C', label: 'Look for the cause quietly and patch it once found, without telling other sites', to: 'end-quiet',
          users: h('Sites that were never told keep treating patients while the cause is still unknown.'),
          team: open('Less disruption and less reputational risk in the short term.'),
          you: open('You are acting on the evidence, but without the openness other sites needed.'),
        },
      ],
    },
    {
      kind: 'end', id: 'end-history', short: 'What happened', title: 'What happened', basis: 'history',
      text: 'Between June 1985 and January 1987 there were six known accidents in which patients received massive radiation overdoses, with deaths and serious injuries. Leveson and Turner traced them to many contributing factors, not to one bug or one person: software faults including a race condition, a design with no independent safeguard for them, limited testing, unclear error messages that staff learned to bypass, and a slow response to reports from hospitals.',
      question: 'Which of the three decisions would you have found hardest to push back on, and who would you have needed on your side?',
    },
    {
      kind: 'end', id: 'end-interlock', short: 'What-if: interlock', title: 'What-if: the independent interlock stays', basis: 'what-if',
      text: 'Not what happened, and not a prediction. An independent interlock does not remove software faults, but it stops one fault from being the only thing between a patient and harm. Leveson and Turner report that the earlier model had a similar software fault that its hardware interlocks kept from harming patients.',
      question: 'What other protections in a system you know depend entirely on one piece of software being right?',
    },
    {
      kind: 'end', id: 'end-review', short: 'What-if: review', title: 'What-if: an independent review first', basis: 'what-if',
      text: 'Not what happened, and not a prediction. A review can surface risks, but only if its findings are acted on. It does not by itself give the machine a safeguard that works when the software is wrong.',
      question: 'When a review finds a risk you cannot fix before launch, who decides, and how is that recorded?',
    },
    {
      kind: 'end', id: 'end-testing', short: 'What-if: testing', title: 'What-if: timing tests and clear errors', basis: 'what-if',
      text: 'Not what happened, and not a prediction. Timing faults only appear when tests deliberately interleave events, such as fast edits, and an error that explains itself gives staff something to act on instead of something to dismiss.',
      question: 'Which messages in your own product have people learned to click past?',
    },
    {
      kind: 'end', id: 'end-stop', short: 'What-if: stop', title: 'What-if: stop and tell every site', basis: 'what-if',
      text: 'Not what happened, and not a prediction. Treating reports as evidence of a possible systemic fault costs service and money, and it shortens the time other patients are exposed to an unknown fault.',
      question: 'What would make it easier for an engineer to raise a stop-use concern inside a company?',
    },
    {
      kind: 'end', id: 'end-quiet', short: 'What-if: quiet fix', title: 'What-if: a quiet fix', basis: 'what-if',
      text: 'Not what happened, and not a prediction. A fix that other sites never hear about leaves them exposed until the fix reaches them, and removes the evidence they need to judge their own risk.',
      question: 'Who needs to know about a fault you have found, and who decides that?',
    },
  ],
};

const DARK_PATTERN: EthicsCase = {
  id: 'dark-pattern',
  title: 'Dark pattern request',
  subtitle: 'Fictional',
  fictional: true,
  honesty: 'A fictional case patterned on a common request. The consequences are illustrative, written to show likely effects, not predictions. Your product team has asked for a cancellation flow where the Cancel link is small and grey, hidden under three screens of offers, and the button for staying reads "No thanks, I like paying more".',
  start: 'request',
  nodes: [
    {
      kind: 'decision', id: 'request', short: 'Request', title: 'The request',
      setup: 'The retention target is ambitious and the spec is signed off. The product team has a fair point as far as it goes: an offer made at the right moment, such as a discount, really does help some people who were about to leave. The problem is not the offer, it is hiding the way out. You are asked to build the flow as written. What do you do?',
      principles: ['1.3', '1.2'],
      choices: [
        {
          id: 'A', label: 'Build it as specified', to: 'launched',
          users: h('Some people who meant to cancel keep paying, or give up after a long search.'),
          team: gain('The retention metric improves and the sprint stays on time.'),
          you: open('You deliver what was asked and own part of what it does to users.'),
        },
        {
          id: 'B', label: 'Push back with data: test the flow, estimate support load, ask what the goal is', to: 'reply',
          users: ok('Your question puts their experience on the table before launch.'),
          team: open('A debate, and perhaps a delay. Your numbers will be challenged as guesses.'),
          you: open('You spend goodwill, and no outcome is guaranteed.'),
        },
        {
          id: 'C', label: 'Propose an honest retention flow: a clear Cancel on the first screen, one optional offer', to: 'end-honest',
          users: ok('Cancelling is easy, and anyone who wants the offer can take it.'),
          team: open('Some of the retention uplift the spec aimed at may not appear.'),
          you: ok('You offer a way to meet the goal that you can explain to users.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'launched', short: 'After launch', title: 'After launch',
      setup: 'Support tickets and public reviews say people cannot find how to cancel. A message arrives from a consumer-protection body asking about the flow.',
      principles: ['1.3', '2.3'],
      choices: [
        {
          id: 'A', label: 'Defend it: it meets the retention target', to: 'end-defended',
          users: h('The flow stays as it is, and people keep struggling to cancel.'),
          team: open('The metric holds while complaints and scrutiny keep growing.'),
          you: open('You stand by the spec, and your name stays on it.'),
        },
        {
          id: 'B', label: 'Say what you built, propose the clear flow now, and bring the complaints to the team', to: 'end-fixed',
          users: ok('Cancelling becomes straightforward after the change.'),
          team: open('A rework, a dip in retention and an uncomfortable review of the original decision.'),
          you: ok('You are open about your part and acting on what you now know.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'reply', short: 'The reply', title: 'The reply',
      setup: 'Product agrees complaints are a cost, but says your numbers are guesses and the launch is next week.',
      principles: ['2.4', '1.2'],
      choices: [
        {
          id: 'A', label: 'Offer a compromise you can build this sprint: clear Cancel, one offer', to: 'end-compromise',
          users: ok('Cancelling is clear, and an offer is still shown.'),
          team: open('Part of the planned uplift is traded for fewer complaints.'),
          you: gain('You keep the conversation going and the launch on time.'),
        },
        {
          id: 'B', label: 'Document your concerns, build as told, and escalate to whoever owns the policy', to: 'end-escalated',
          users: h('The flow ships while the escalation is still pending.'),
          team: open('The concern is on record and the decision moves to someone with authority over it.'),
          you: open('You have been transparent, and you have still built something you doubted.'),
        },
      ],
    },
    {
      kind: 'end', id: 'end-honest', short: 'Honest flow', title: 'An honest retention flow', basis: 'illustrative',
      text: 'Illustrative. Cancelling is easy, so the product keeps customers who want it and loses those who do not. The flow itself is less likely to draw complaints, and the team has traded some retention for trust.',
      question: 'How would you test whether an honest offer retains enough customers to satisfy the goal?',
    },
    {
      kind: 'end', id: 'end-defended', short: 'Defended', title: 'The flow stays', basis: 'illustrative',
      text: 'Illustrative. The retention metric holds for a while, and complaint volume and external scrutiny keep rising. Users who feel tricked may leave anyway, and tell others.',
      question: 'What would have to be true for you to say "I should have raised this earlier"?',
    },
    {
      kind: 'end', id: 'end-fixed', short: 'Fixed later', title: 'Changed after launch', basis: 'illustrative',
      text: 'Illustrative. The flow is repaired after some people were affected. The team learns about the cost, and it is still possible to be honest about why the change happened.',
      question: 'What process would have caught this before launch?',
    },
    {
      kind: 'end', id: 'end-compromise', short: 'Compromise', title: 'A compromise', basis: 'illustrative',
      text: 'Illustrative. A clear Cancel and a single offer ship on time. Retention comes in below the original ambition, and complaints are lower. Whether the compromise is honest enough is still a judgement call.',
      question: 'Which parts of the compromise would you still want to change, and what evidence would you bring?',
    },
    {
      kind: 'end', id: 'end-escalated', short: 'Escalated', title: 'Escalated', basis: 'illustrative',
      text: 'Illustrative. The concern is documented and a decision-maker is now involved. The flow ships as specified for now, and what happens next depends on that decision.',
      question: 'When is documenting a concern enough, and when is it not?',
    },
  ],
};

const LOCATION: EthicsCase = {
  id: 'location',
  title: 'Data you did not need',
  subtitle: 'Fictional',
  fictional: true,
  honesty: 'A fictional case patterned on a common request. The consequences are illustrative, written to show likely effects, not predictions. A "nearby help" feature only needs a user\'s rough area. The analytics team asks you to also collect precise location "just in case we find a use for it later".',
  start: 'collect',
  nodes: [
    {
      kind: 'decision', id: 'collect', short: 'Collect?', title: 'What to collect',
      setup: 'The extra data would cost little to collect today. How do you handle it? See `security-principles` for what holding data adds to the risk.',
      principles: ['1.6', '2.9'],
      choices: [
        {
          id: 'A', label: 'Collect precise location from everyone, always', to: 'review',
          users: h('A detailed movement history exists about people who only wanted the nearby feature.'),
          team: gain('The analytics team has flexibility and no extra design work.'),
          you: open('You make the team happy now and own the data you chose to keep.'),
        },
        {
          id: 'B', label: 'Minimise: compute a coarse area on the device and store nothing precise', to: 'end-minimal',
          users: ok('The feature works and there is much less to leak.'),
          team: open('Analytics loses data it might have used someday.'),
          you: ok('You can explain exactly what is collected and why.'),
        },
        {
          id: 'C', label: 'Ask: offer opt-in precise location, with a plain explanation, only where a feature needs it', to: 'optin',
          users: ok('People who want precise results can choose them knowingly.'),
          team: open('More design work, and fewer people will opt in.'),
          you: ok('You are respecting people\'s choice and keeping the data tied to a purpose.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'review', short: 'Review', title: 'Months later',
      setup: 'A review finds the precise location history readable by a wide group of staff and kept indefinitely. No incident has happened yet.',
      principles: ['1.6', '2.5'],
      choices: [
        {
          id: 'A', label: 'Restrict access, add a retention limit, and delete what no feature uses', to: 'end-tightened',
          users: ok('Fewer people can see their history, and old data is gone.'),
          team: open('Analytics loses history it expected to keep.'),
          you: ok('You are fixing a risk you found before it became an incident.'),
        },
        {
          id: 'B', label: 'Note it for later; nothing has gone wrong', to: 'end-deferred',
          users: h('The data stays widely readable and indefinitely kept.'),
          team: gain('No immediate work, at the price of leaving a known risk in place.'),
          you: open('The risk is known and written down, and not yet dealt with.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'optin', short: 'Opt-in', title: 'The opt-in rate',
      setup: 'Few people opt in. Product suggests pre-ticking the box so most people end up sharing precise location.',
      principles: ['1.3', '1.6'],
      choices: [
        {
          id: 'A', label: 'Keep opt-in off by default and improve the explanation', to: 'end-informed',
          users: ok('Those who share precise location chose to.'),
          team: open('Opt-in stays lower than product hoped.'),
          you: ok('You keep the choice real.'),
        },
        {
          id: 'B', label: 'Pre-tick the box', to: 'end-pretick',
          users: h('Many people share precise location without noticing they agreed to anything.'),
          team: gain('Most users end up in the dataset.'),
          you: open('You still have an "opt-in" to point to, and a doubt about how real the choice is.'),
        },
      ],
    },
    {
      kind: 'end', id: 'end-minimal', short: 'Minimal', title: 'Collect only what the feature needs', basis: 'illustrative',
      text: 'Illustrative. The feature works from a coarse area. There is little precise data to leak, to misuse or to answer for. Analytics must find another way to answer questions it hoped location would answer.',
      question: 'What would you need to know to justify collecting something more precise later?',
    },
    {
      kind: 'end', id: 'end-tightened', short: 'Tightened', title: 'Access and retention tightened', basis: 'illustrative',
      text: 'Illustrative. The risk is reduced after it was found. The history that was collected before the change is still a record people did not expect to exist.',
      question: 'Who should have been asked before the data was collected, and how?',
    },
    {
      kind: 'end', id: 'end-deferred', short: 'Deferred', title: 'Deferred', basis: 'illustrative',
      text: 'Illustrative. Nothing happens for now. The data stays easy to misuse by anyone with access, and the longer it is kept, the more people it describes.',
      question: 'What would make a known risk worth acting on before there is an incident?',
    },
    {
      kind: 'end', id: 'end-informed', short: 'Informed opt-in', title: 'A real opt-in', basis: 'illustrative',
      text: 'Illustrative. Fewer people share precise location, and those who do have chosen it. The data is smaller and easier to defend, and less complete.',
      question: 'How would you tell whether people understood what they agreed to?',
    },
    {
      kind: 'end', id: 'end-pretick', short: 'Pre-ticked', title: 'A pre-ticked box', basis: 'illustrative',
      text: 'Illustrative. The dataset is larger. Many of the people in it may not realise they agreed, which makes the consent weaker (in some jurisdictions a pre-ticked box does not count as valid consent) and invites complaints if it comes to light.',
      question: 'What makes a default a choice, and what makes it a nudge?',
    },
  ],
};

const FRIDAY: EthicsCase = {
  id: 'friday',
  title: 'Ship it Friday',
  subtitle: 'Fictional',
  fictional: true,
  honesty: 'A fictional case patterned on a common situation. The consequences are illustrative, written to show likely effects, not predictions. A day before a launch, you find that people who use screen readers cannot finish checkout: the pay button has no accessible name. See `accessibility`.',
  start: 'blocker',
  nodes: [
    {
      kind: 'decision', id: 'blocker', short: 'Blocker', title: 'The blocker',
      setup: 'The launch is announced for tomorrow. The fix is small, but it needs testing with a screen reader. What do you do?',
      principles: ['1.4', '2.5'],
      choices: [
        {
          id: 'A', label: 'Ship on time and log a ticket for later', to: 'week-later',
          users: h('Screen-reader users cannot complete checkout from day one.'),
          team: gain('The launch date holds.'),
          you: open('You know about the blocker and have chosen not to stop for it.'),
        },
        {
          id: 'B', label: 'Raise it, propose the small fix, and ask for a day if testing needs it', to: 'end-delayed',
          users: ok('Checkout works for people who use screen readers from the start.'),
          team: open('A short delay, or an awkward scramble.'),
          you: ok('You have raised the risk with a concrete option.'),
        },
        {
          id: 'C', label: 'Ship with a documented workaround: phone support for affected users, fix next sprint', to: 'workaround',
          users: open('People can finish a purchase, but only by phoning and by waiting.'),
          team: open('The date holds and support takes on the cost.'),
          you: ok('You have named the problem and a stop-gap, and told the people who need to know.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'week-later', short: 'A week later', title: 'A week later',
      setup: 'Support has two complaints and a user posts publicly. The backlog is full.',
      principles: ['1.4', '2.1'],
      choices: [
        {
          id: 'A', label: 'Make the fix this sprint\'s top item', to: 'end-fixed-late',
          users: ok('Checkout works for screen-reader users after a week.'),
          team: open('Other work slips.'),
          you: ok('You have turned a known gap into a priority.'),
        },
        {
          id: 'B', label: 'Leave it in the backlog', to: 'end-ignored',
          users: h('The gap stays open, and more people run into it.'),
          team: gain('Planned work carries on, with the known gap still open.'),
          you: open('You are leaving a ticket you wrote waiting while people are affected.'),
        },
      ],
    },
    {
      kind: 'decision', id: 'workaround', short: 'Workaround', title: 'The workaround',
      setup: 'The phone line is not staffed at weekends, when many people shop.',
      principles: ['1.4', '3.1'],
      choices: [
        {
          id: 'A', label: 'Staff it and schedule the fix within days', to: 'end-covered',
          users: ok('There is a way to finish a purchase, and a fix is coming soon.'),
          team: open('Weekend cover and a rushed fix.'),
          you: ok('You are making the stop-gap real and keeping it short.'),
        },
        {
          id: 'B', label: 'Accept the gap: it only affects some people at the weekend', to: 'end-gap',
          users: h('Some people have no way to finish a purchase on some days.'),
          team: gain('No extra staffing.'),
          you: open('The workaround exists on paper and not when people need it.'),
        },
      ],
    },
    {
      kind: 'end', id: 'end-delayed', short: 'Delayed a day', title: 'Fixed before launch', basis: 'illustrative',
      text: 'Illustrative. The launch slips a day or the team scrambles to test the fix. Checkout works for everyone from the start, and the team now has a precedent for raising accessibility problems early.',
      question: 'What would make a one-day delay for accessibility easier to ask for next time?',
    },
    {
      kind: 'end', id: 'end-fixed-late', short: 'Fixed late', title: 'Fixed a week late', basis: 'illustrative',
      text: 'Illustrative. People who use screen readers could not check out for a week. The fix is in, and the process that let it ship is still there.',
      question: 'What check would have caught this before the launch announcement?',
    },
    {
      kind: 'end', id: 'end-ignored', short: 'Left open', title: 'Left open', basis: 'illustrative',
      text: 'Illustrative. The gap stays. Complaints accumulate, and the longer the gap lasts the more it becomes a reputation and compliance question, not just a ticket.',
      question: 'Who owns accessibility work when it competes with planned features?',
    },
    {
      kind: 'end', id: 'end-covered', short: 'Covered', title: 'A workaround that works', basis: 'illustrative',
      text: 'Illustrative. People have a way to finish a purchase while the fix is built, and the stop-gap is short. It costs the team weekend cover and a rushed schedule.',
      question: 'What would make a workaround acceptable, and what would make it an excuse?',
    },
    {
      kind: 'end', id: 'end-gap', short: 'A gap', title: 'A gap in the workaround', basis: 'illustrative',
      text: 'Illustrative. Some people are shut out on some days. It saves staffing cost, and it leaves a group of customers with no route when they need one.',
      question: 'Who decides that a group affected "only sometimes" can wait?',
    },
  ],
};

export const CASES: readonly EthicsCase[] = [THERAC, DARK_PATTERN, LOCATION, FRIDAY];
