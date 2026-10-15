import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A contract test writes down exactly what a consumer relies on and replays it against the provider, so a breaking change fails in the provider\'s pipeline before deploy, though it sees shape and not meaning.',
    what: 'The consumer lists the response fields it reads, each with a type matcher and no values. The provider replays that contract against its real handler and reports a mismatch with a path such as `$.body.name`. A deploy gate is computed from the grid of consumer versions against provider versions, so a provider version is blocked by the consumer versions in production that it would break. What a contract cannot check is what a field means.',
    analogy: 'Order slips in a restaurant queue: the kitchen can change anything on the menu except the items on slips still waiting, but a slip that says "one coffee" cannot say the cup got smaller.',
    useCases: [
      'Microservices owned by different teams, where a provider needs to know who relies on which field',
      'A mobile app and its backend, where an old app version keeps calling for months',
      'A frontend and its backend-for-frontend, replacing a shared staging environment',
      'Partner integrations, where the consumer\'s needs are written down instead of guessed',
    ],
    why: 'End-to-end suites that deploy the whole system are often slow and flaky, and a schema test on the whole response gives false alarms for fields nobody reads. A contract is the middle path: it tests the agreement and nothing else. It builds on `api-versioning`, and it complements the cheaper layers in `test-pyramid` and the doubles in `test-doubles`.',
    watch: 'A field named in the contract is blue and one left out is grey. A green chip is a check that passes or a matcher the page survives; a red one is a failed check or a matcher that lets through a value that breaks the page, and the mismatch path is yellow. In the matrix a cell is green when that consumer version verifies against that provider version and red when it fails, and a blue chip marks what runs in production. In the last scene an orange line and an orange chip are a green check that is wrong: the contract passes while the page charges the wrong amount.',
  },
  tryThis: [
    'Start with the default page, which reads id, name and amount, and a contract naming exactly those. Switch "The page shows the email" to yes: the contract now misses email, flagged in red.',
    'Set the matcher for amount to number: the chip says the page breaks on 1.5, because the page needs a whole number of cents.',
    'In The provider verifies, press Remove email: the contract still passes, while the full-schema test of the same response fails.',
    'In Can I deploy?, provider v2 is blocked by consumer v2; mark consumer v2 "not live" and the gate opens, so Deploy works.',
    'In What it cannot see, switch the provider to amount in dollars: the contract passes, the page shows $0.25, and the behaviour test fails.',
  ],
  keyIdeas: [
    'A contract lists the fields the consumer reads as matchers and not values, so a provider stays free to change anything no consumer uses.',
    'The provider replays each consumer\'s contract against its real handler, and a failure names the path, such as `$.body.name: expected string, got nothing`.',
    'A can-i-deploy gate comes from the version grid: a provider version is blocked by the consumer versions in production whose contracts it breaks.',
    'A contract checks shape and agreement, not meaning: a whole number still passes when cents become dollars, so a behaviour test stays necessary.',
  ],
  quiz: [
    {
      q: 'A provider changes amount from cents to dollars, still a whole number. What do the contract tests report?',
      options: [
        'They pass, because the shape did not change',
        'They fail with a type mismatch on amount',
        'They fail with a value mismatch on amount',
        'They warn that the unit of amount changed',
      ],
      answer: 0,
      why: 'A contract holds a matcher such as integer and no values, so 2500 and 25 are indistinguishable to it. Catching a change of meaning takes a behaviour test, which is why contracts add to the other layers and do not replace them.',
    },
    {
      q: 'Who decides which fields appear in a consumer-driven contract?',
      options: [
        'Each consumer, naming the fields it reads',
        'The provider, listing every field it returns',
        'A central team, from the provider\'s schema',
        'The test tool, recording what production sends',
      ],
      answer: 0,
      why: 'The consumer is the one party that knows what it reads, so it writes the contract and the provider verifies it. A provider-written list is a schema test, which flags removals that nobody notices.',
    },
    {
      q: 'A provider removes email, which no consumer reads. How do a full-schema test and the consumers\' contracts react?',
      options: [
        'The full-schema test fails and the contracts pass',
        'Both fail, since a field disappeared from the response',
        'Both pass, since removals are never checked',
        'The contracts fail and the full-schema test passes',
      ],
      answer: 0,
      why: 'The full-schema test asserts each field the provider ever sent, so it raises a false alarm. The contracts name what is read, so removing an unread field changes no result.',
    },
    {
      q: 'Provider v2 verifies against consumer v3, not yet released, but fails against consumer v2, an app still running on phones. Can v2 deploy?',
      options: [
        'No, because it breaks a consumer version in production',
        'Yes, because the newest consumer version is the one that counts',
        'Yes, once the provider team signs off on the failure',
        'No, until consumer v3 has been released to production',
      ],
      answer: 0,
      why: 'The gate looks at the consumer versions running in production, since old apps keep sending old requests. An unreleased version cannot block a deploy, and a sign-off does not make the failing contract pass.',
    },
    {
      q: 'A team has a contract for each of the 10 dependency edges between its 8 services and deletes its end-to-end suite. What does it lose?',
      options: [
        'Checks of meaning and whole journeys that shape cannot see',
        'Nothing, since 10 contract checks cover the 8 services',
        'Only speed, since contracts test the same things faster',
        'The record of which consumer versions are in production',
      ],
      answer: 0,
      why: 'Contract verification is one independent check per edge, 10 here, each needing two services up, while an end-to-end run needs the 8 together, so contracts are cheaper. They see the shape of a message, not what a field means or whether a journey across services works, so a few end-to-end and behaviour tests stay.',
    },
  ],
};

export default lesson;
