import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Domain-driven design draws boundaries inside the model first: one word can mean different things to different teams, so each meaning gets its own bounded context, and each consistency rule gets an aggregate.',
    what: 'A shared Customer holding the attributes of all four teams couples those teams, because a change for one reaches the others. A bounded context is a boundary around a model and its vocabulary, inside which a word means one thing; between contexts, models are translated and linked by an id. Inside a context, an aggregate is a cluster of objects with one root that enforces an invariant, such as an order\'s limit on lines.',
    analogy: 'A hospital where "patient" means a bed to the ward, an account to billing and a chart to the lab: one shared form with a field for each department\'s needs would belong to nobody, while three forms linked by a patient number let each department change its own.',
    useCases: [
      'Untangling a model that several teams edit, before anyone proposes splitting it into services',
      'Deciding which team owns a word such as customer, account or product',
      'Setting the consistency boundary of an order, a booking or a basket',
      'Choosing how two teams integrate: a shared kernel, a published language or a translation layer',
    ],
    why: 'Teams argue about services when the real problem is a model that has no boundaries. Drawing contexts and aggregates first gives the arguments about services something to follow, and it explains why one shared Customer table keeps costing the teams that share it. It builds on `coupling-cohesion` and `layered-hexagonal`, and uses `optimistic-pessimistic-locking` for the version check.',
    watch: 'Contexts are plain categories drawn as coloured regions (amber Billing, sky Fulfilment, pink Support), and a concept inside one takes that colour while a concept not yet placed stays grey. An edge inside a context is green, one that crosses a boundary and keeps only an id is red, one that reaches into another context\'s own objects is orange, and one that passes through a split Customer, or has a published language or an anticorruption layer chosen for it, is violet and dashed with a label. In the first scene each team has its own colour, a solid cell is a write and a tinted one a read, and a yellow ring marks the attribute being changed. In the last scene a blue cell is a line in the order, a red one a line over the limit, and a red chip a design that broke the limit where a green chip means it held.',
  },
  tryThis: [
    'In One model for everything, "Support renames tier" touches 3 of the 4 teams; pick any other request and the blast radius is still 3.',
    'In Draw the boundaries, press Suggested placement: 7 edges cross a boundary. Then flip Customer to "split into three": 4 cross.',
    'Press Everything in one context: nothing crosses and cohesion is 100%, yet the stats still say Customer has several meanings.',
    'After Suggested placement and the split, select Invoice and press 2: its edge to Payer turns violet and dashed, labelled "translated".',
    'In Where consistency stops, the default run (R1 R2 W1 W2 on independent records) ends with 6 lines; switch to "Order as an aggregate" and it ends with 5.',
  ],
  keyIdeas: [
    'One shared Customer couples the teams: in this model each of the five change requests touches 3 of the 4 teams.',
    'A bounded context is a boundary around a model and its words, not a deployment unit: Customer can be a payer in one context and a recipient in another, linked by an id.',
    'A boundary is judged by the edges that cross it, and a crossing that reaches into another context\'s own objects is the costliest kind.',
    'An aggregate is a consistency boundary: with a version check an order holds its limit across the six interleavings, where independent records break it on four.',
  ],
  quiz: [
    {
      q: 'A team keeps one Customer model with 14 attributes for billing, shipping, support and marketing. What is the main cost?',
      options: [
        'A change one team needs can ripple into the other teams\' code',
        'The model takes more storage than four smaller ones would',
        'The database cannot index that many attributes on one table',
        'The teams cannot read each other\'s data any more',
      ],
      answer: 0,
      why: 'Each team reads or writes many of the same attributes, so a rename or a new format for one reaches the others: in this lesson\'s matrix, each of five requests touches 3 of 4 teams. Storage and indexing are not what a shared model costs here.',
    },
    {
      q: 'What is a bounded context?',
      options: [
        'A boundary inside which one model and its words keep a single meaning',
        'A microservice that has its own database and its own deploys',
        'A package in the codebase that other packages may not import',
        'A team\'s reporting line, drawn around the people who own it',
      ],
      answer: 0,
      why: 'A context is about meaning, so "customer" can mean a payer in one and a recipient in another. It may be implemented as a module, a package or a service, but those are choices made after the boundary is drawn.',
    },
    {
      q: 'Customer is split into Payer, Recipient and Requester. What joins the three?',
      options: [
        'A shared customer id, and nothing more',
        'A common base class that holds each attribute',
        'One shared table that all three contexts read',
        'The same 14 attributes kept in each of them',
      ],
      answer: 0,
      why: 'Each context keeps just what it needs about the customer, and they refer to the same person by an id. A shared base class or table would bring back the coupling the split removed.',
    },
    {
      q: 'Two placements put the same nine concepts into the same three contexts. By this lesson\'s measure, which is better?',
      options: [
        'The one where fewer edges cross a context boundary',
        'The one that puts the most concepts into Billing',
        'The one where each context holds the same number of concepts',
        'The one that cuts the heaviest usage edge',
      ],
      answer: 0,
      why: 'Edges that cross a boundary are the coupling between contexts, so fewer crossings means a more cohesive split. Counting concepts per context says nothing about coupling, and this lesson counts crossing edges, not their weight, so cutting the heaviest edge does not by itself lower the number it measures.',
    },
    {
      q: 'An order may hold 5 lines and holds 4. Two actors both read 4 before either writes, and the lines are independent records. How does it end?',
      options: [
        'With 6 lines, one over the limit and no error',
        'With 5 lines, because the second write is refused',
        'With 4 lines, because the two writes conflict',
        'With 5 lines, because the database keeps the limit',
      ],
      answer: 0,
      why: 'Both actors checked against a stale read, and nothing compares the order\'s state at write time, so both lines are added. A version check on an aggregate root is what turns the second write into a retry that sees 5 lines.',
    },
  ],
};

export default lesson;
