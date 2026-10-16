import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { controlById } from './model';
import { Stage } from './Stage';

const trailCovers = controlById('audit-trail').covers.join(' then ');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Threat modelling is asking, before you build or ship, what can go wrong with this system and what you will do about it, and STRIDE gives you six questions to ask of each part of a data-flow diagram.',
    what: 'You draw the system as a data-flow diagram: outside actors, processes, data stores and the flows between them, with trust boundaries where the level of trust changes. Then you ask the six STRIDE questions of each element, using the per-element chart of which questions apply. The lesson lets you move two stores between zones and watch which flows cross a boundary, reveal generic threats in a coverage grid, match nine controls to the category each one really addresses, and finish with an invented sprint where you cannot fix everything. Everything here is simulated on an invented checkout system, and no threat sentence names a technique.',
    analogy: 'A pre-flight checklist: it does not list every way a flight can fail, it makes you ask the same questions of each system before you take off.',
    useCases: [
      'Reviewing a design document before the build starts',
      'Deciding which flows get an authentication, integrity or rate-limit control',
      'Explaining to a team why one flow was reviewed and another was not',
      'Ranking a short list of security work against one sprint',
    ],
    why: 'Security work is cheapest while the design is still a drawing, and a list of attacks goes out of date while a method for asking questions keeps working. Knowing what a crossing, a category and a control each claim is how you stop a review from becoming a list of fears.',
    watch: 'The four zones are plain categories: the Internet is amber, the App tier pink, the Data tier sky and the Third party violet (the colour for a grouping), and each box takes its zone\'s colour. A flow that crosses a boundary is a dashed orange line (--orange); the element or flow in focus is yellow (--hi). In the coverage grid a cell not yet looked at is a grey outline (--dim), a revealed threat is red (--bad) with "!", a mitigated one green (--ok) with a tick, and a cell where STRIDE does not apply is empty. A refused control is orange text. In the story a meter is blue while it is fine and red past its edge.',
  },
  tryThis: [
    `Diagram, on the defaults (Orders DB in the Data tier, Audit log in the App tier): ${F.crossingDefault} of ${F.flows} flows cross a boundary and are dashed. Move the Audit log to the Data tier and ${F.crossingAuditInData} cross. Press Reset, then move the Orders DB to the App tier: ${F.crossingOrdersInApp} cross.`,
    `Diagram, on the defaults: click the Audit log, then the Orders DB. The log gets ${F.auditCategories} STRIDE categories and the store ${F.ordersCategories}. Press "Look at it" on the Orders DB's Tampering row: ${F.revealedAfterOne} of ${F.cells} threats are revealed and ${F.neverLookedAfterOne} cells were never looked at.`,
    `Answer a threat, from a fresh load: press "Reveal all threats", select the Browser's spoofing threat and press "Rate limiting and redundancy". It is refused, because that control addresses denial of service. Press "Strong authentication" instead: ${F.mitigatedAfterAccept} of ${F.cells} threats are mitigated.`,
    `One sprint, on the defaults: pick "Fix it properly" for the first threat and press Continue. Known residual risk drops from ${F.startRisk} to ${F.riskAfterFix} and effort reads ${F.effortAfterFix} of ${F.sprintDays} days.`,
  ],
  keyIdeas: [
    `A flow that crosses a trust boundary is where the level of trust changes, so it gets extra scrutiny: on the defaults ${F.crossingDefault} of the ${F.flows} flows cross one, and moving a store to another zone changes that count.`,
    `STRIDE asks a different list of questions of each kind of element: ${F.ordersCategories} categories for a data store, ${F.auditCategories} for a log, and ${F.cells} applicable cells across the five elements and four flows of this model.`,
    `A control answers a category, not a threat in general: in this model rate limiting addresses denial of service and is refused for spoofing, while an append-only audit trail addresses repudiation and tampering.`,
    'A score ranks threats for a conversation and does not find them. A deferred review keeps the known risk looking low because nobody has looked, and an accepted risk with a named owner is a decision, not a gap.',
  ],
  quiz: [
    {
      q: 'Which STRIDE category does an append-only, signed audit trail mainly address?',
      options: [
        'Spoofing, because a trail stops a person from pretending to be somebody else',
        'Information disclosure, because writing events down keeps others from reading them',
        'Repudiation, because there is a record of who did what that cannot be quietly rewritten',
        'Denial of service, because a trail spreads the load of requests over more servers',
      ],
      answer: 2,
      why: `Repudiation is about being able to say who did what. In this model the trail covers ${trailCovers.toLowerCase()}, in that order: repudiation first, tampering second.`,
    },
    {
      q: 'Why does a data flow that crosses from the Internet zone into the App zone get extra scrutiny?',
      options: [
        'The level of trust changes there, so the receiving side cannot take what arrives at face value',
        'Traffic across a boundary is slower than traffic inside a single zone, so it fails more often than the rest',
        'A flow that crosses a zone has to be approved by the team that drew the diagram',
        'Boundaries are where encryption is switched on, so the flow cannot be looked at afterwards',
      ],
      answer: 0,
      why: `A boundary marks where one side trusts the other less. In this model that is why the crossing flows are dashed: ${F.crossingDefault} of ${F.flows} on the defaults.`,
    },
    {
      q: 'A teammate says a code scan will find the threats, so the diagram is a waste of time. What is the accurate reply?',
      options: [
        'A scan is slower than a diagram, but both end up with the same list of threats in the end',
        'A diagram finds the threats a scan would find, which makes the scan unnecessary for a small system',
        'A scan is run by a tool, so its findings are settled and a diagram can only add opinions',
        'A scan checks code for known flaws, while the diagram asks what can go wrong with the design itself',
      ],
      answer: 3,
      why: 'A tool finds what it was built to look for; a threat model asks about design, trust and missing controls that no line of code is wrong about. Neither finds everything.',
    },
    {
      q: 'In the sprint you defer the re-run for the new partner integration, and known residual risk looks lower. What does that number tell you?',
      options: [
        'It is lower because the deferral removed the new threat from the system for the rest of the sprint, and the number shows it',
        'It looks lower because the new crossing has not been looked at, so the risk is unknown, not smaller',
        'It is the same as total risk, because known risk includes threats nobody has found yet',
        'It is lower because a written note with an owner reduces the likelihood of the threat',
      ],
      answer: 1,
      why: 'Known risk counts what was looked at. In this model a deferred re-run adds an unreviewed crossing instead of points, so the page reads better while knowing less.',
    },
  ],
};

export default lesson;
