import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Where you draw team lines decides which calls become interfaces and which changes need a handoff; a layout can cut handoffs and still overload a team, so the model shows trade-offs and no single answer.',
    what: 'You place eight invented services on up to three teams and watch handoffs (teams touched by a change, minus one), interfaces (calls across a team line) and each team\'s cognitive load against an invented cap. Three presets sit beside your layout, then a search over the whole space of assignments shows one reference layout and how the cap moves it, and last you move one service across a line to see what changes. The services, calls, changes and the cap are invented.',
    analogy: 'Walls in a house: put a wall between two rooms that share a door and each trip through it now needs someone to open it, but a house with no walls has one very crowded room. Where the walls go decides who meets whom.',
    useCases: [
      'Splitting a growing team and seeing which calls turn into agreements between teams',
      'Explaining why a feature that touches three teams is slow',
      'Checking that a team boundary leaves each team a load it can hold in its head',
      'Weighing teams by layer against teams by user journey',
    ],
    why: 'Team boundaries are a design decision made once and paid for in each change that crosses them. Seeing handoffs, interfaces and load move together shows what one team and one team per layer each cost.',
    watch: 'Each service is a box coloured by its team (the same three team colours as the key); a grey line is a call inside one team and a red line is a call across teams, an interface. In the tables a red number is a team over the cap or a change touching three teams, and a bold row is your own layout. The reference lists the best layouts for the cap you set, under a one-view label.',
  },
  tryThis: [
    `The board, from a fresh load (no service placed): press "One team". Handoffs read ${F.oneHandoffs}, interfaces ${F.oneInterfaces}, and the largest load reads ${F.oneLoad}, red against the cap of ${F.cap}.`,
    `Press "By layer": handoffs ${F.layerHandoffs}, interfaces ${F.layerInterfaces}, and team B's load is ${F.layerLoadB}, red. F2 (a new payment method) touches three teams (see the changes table on "What the numbers say").`,
    `Press "By journey": handoffs ${F.journeyHandoffs}, interfaces ${F.journeyInterfaces}, and the largest load reads ${F.journeyLoad}, inside the cap.`,
    `On the first scene move "payments" from team C to team A: handoffs fall to ${F.movedHandoffs} and interfaces to ${F.movedInterfaces}, but team A's load is ${F.movedLoadA} and goes red.`,
    `Open "One reference" and press "Show one reference" (cap ${F.cap}): ${F.refTied} tied layouts score ${F.refScore}. Move the cap to ${F.wideCap} and the reference becomes ${F.wideTeams === 1 ? 'one team' : `${F.wideTeams} teams`} at ${F.wideScore}.`,
  ],
  keyIdeas: [
    `In this model team lines are interface lines: by layer the services make ${F.layerInterfaces} interfaces and ${F.layerHandoffs} handoffs, by journey ${F.journeyInterfaces} and ${F.journeyHandoffs} (Conway's observation is one view, a tendency and not a law).`,
    `Fewer handoffs can cost load: one team has ${F.oneHandoffs} handoffs and a load of ${F.oneLoad}, over the assumed cap of ${F.cap}, while by journey stays inside it at ${F.journeyLoad} with ${F.journeyHandoffs} handoffs; whether splitting pays depends on how often changes cross the new lines.`,
    `There is no single answer even here: at a cap of ${F.cap} ${F.refTied} layouts tie at ${F.refScore}, and the cap is an assumption, because at ${F.tightCap} the best score is ${F.tightScore} and at ${F.wideCap} it is ${F.wideScore}.`,
    `In this model no layout is best on every axis: by layer keeps ${F.layerPeers} skill peers together against ${F.journeyPeers} by journey and pays ${F.layerHandoffs} handoffs for it, over the cap of ${F.cap}; ${F.layerBeaten} of the ${F.groupings} groupings beat it on all four axes (${F.layerBeatenInCap} of them inside the cap), so it is a common layout this model prices and does not recommend (the inverse Conway manoeuvre, shaping teams for the design you want, is a practice with the same trade-offs).`,
  ],
  quiz: [
    {
      q: "What does Conway's observation say, in one view?",
      options: [
        'Teams should be as large as the system they build, so that nobody on the team is ever idle',
        'Organisations tend to build designs that mirror their own communication paths',
        'Software ends up with exactly one module for each team in the company, whatever its size',
        'A good architecture makes the org chart unnecessary for the people who work within it',
      ],
      answer: 1,
      why: `It is a tendency, one view of how designs follow communication: in this model the by-layer layout puts ${F.layerInterfaces} calls across team lines and by journey ${F.journeyInterfaces}, and which is better depends on the changes.`,
    },
    {
      q: "Splitting one team into three lowers each team's load. What does the lesson show it costs?",
      options: [
        'More handoffs and interfaces, and whether that pays depends on how often changes cross the new lines',
        'Nothing at all, because smaller teams are strictly better at every size of system that exists',
        'More load, because each of the three teams then has to know about every one of the services',
        'Fewer interfaces, because services merge together once the teams that own them are split up',
      ],
      answer: 0,
      why: `From one team (${F.oneHandoffs} handoffs, ${F.oneInterfaces} interfaces, load ${F.oneLoad}) to by layer (${F.layerHandoffs}, ${F.layerInterfaces}, load ${F.layerLoadB} on team B), so it depends on how often changes cross the new lines.`,
    },
    {
      q: 'What is the inverse Conway manoeuvre?',
      options: [
        'Redesigning the software to match whichever org chart happens to exist today',
        'Removing every team boundary so that a single design emerges from the whole group of people',
        'Moving each service to whichever team complains about it the loudest in planning meetings',
        'Shaping teams and communication to encourage the architecture you want to end up with',
      ],
      answer: 3,
      why: 'It reverses the usual direction: choose the design first, then draw teams and contracts to fit it. It is a practice with costs, which the move scene prices in handoffs, interfaces and load.',
    },
    {
      q: `The one-team preset has ${F.oneHandoffs} handoffs in the lesson. Why is it not the answer?`,
      options: [
        'Handoffs do not matter much, so the preset has no real advantage over the other layouts',
        'The board does not allow one team, since it needs at least two teams to place the services',
        `Its load of ${F.oneLoad} is over the cap of ${F.cap}, an assumption that moves the answer`,
        'It has the most interfaces of all the presets, because everything talks to everything else',
      ],
      answer: 2,
      why: `The cap is an invented, adjustable assumption: at ${F.wideCap} the best reference in this model is one team at ${F.wideScore}, at ${F.cap} it is ${F.refTied} layouts at ${F.refScore}.`,
    },
    {
      q: "A reader concludes that Conway's law means architecture can never be changed without a reorganisation. What is wrong with that?",
      options: [
        'Nothing is wrong with it, because the law is a proven theorem about how organisations work',
        'It is a tendency, and communication, tooling and contracts can offset it to some degree',
        'Reorganisations do not change architecture at all, which shows that the law is simply false',
        'The law applies to companies with more than one hundred people on staff and to no others',
      ],
      answer: 1,
      why: 'It is an observation, not a theorem (one view): an interface agreed between two teams, a shared tool or a contract changes how far the org chart shapes the design (common practice: this model has no tooling or contract term, only the interface count).',
    },
  ],
};

export default lesson;
