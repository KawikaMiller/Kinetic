import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Whether an API change breaks anything depends on who calls it, so this lesson runs real client code against nine changes, then compares ways to carry a version and ways to retire an old one.',
    what: 'A tolerant reader takes the fields it uses and ignores the rest, a strict one rejects anything it does not know, and some clients lean on behaviour nobody wrote down, like a default sort order. A version in the URL, a header, a query parameter or a date tells the server which contract a client wants, but none of them reduces how many versions you keep running. Deprecation is an announcement, a sunset date and an honest look at who has not moved.',
    analogy: 'A public power socket: you can fit a second socket beside it any day, but changing the voltage on the old one cuts off every device plugged in, including those whose owners never read your notice.',
    useCases: [
      'Public REST APIs used by partners who upgrade on their own schedule',
      'Mobile apps, where an old version stays installed for months after a release',
      'Internal service APIs with many consumers that no team fully tracks',
      'Webhook payloads and SDKs, where the caller\'s code is not yours to change',
    ],
    why: 'Every breaking change is a negotiation with people who do not read your changelog. A matrix of changes against the clients you really have, a versioning strategy chosen on purpose and a sunset with a date are what turn a migration into a plan instead of an outage. It builds on `schema-evolution`, which covered the wire-level rules, and `rest-api-design`.',
    watch: 'Each client has its own colour in the matrix header (amber, sky, pink and grey), while the result of a run is coloured by what happened: green when the client still works, orange when it works but its result changed, red when it breaks. In the strategy scene a green chip is a change that ships in place or a cache that serves the right version, blue a change that needs a new version, red a refused change or a cache serving the wrong version; the bar counts live versions. On the timeline the announcement is blue, the sunset yellow and a brownout orange; a client bar is green when it migrated by the sunset and red when it is still on the old version when the sunset arrives. A header button shows the active sort with an arrow.',
  },
  tryThis: [
    'Start with Add an optional response field: only the Partner integration breaks, with "unexpected property nickname"; the other three clients keep working.',
    'Pick Change the default sort order: nothing throws, yet the Batch job\'s cell is orange, because its result changed.',
    'Press the Broken column header to sort the matrix by how many clients each change breaks; press it again to reverse the order.',
    'In Versioning strategies, pick Version in a header: the v2 client is served the cached v1 body; switch the response to Vary: Api-Version and the cache keeps them apart.',
    'In Deprecation and sunset, the default 90 days leaves two clients on v1 at the sunset; slide the window to 120 days or more and the partner makes it, leaving the batch job.',
  ],
  keyIdeas: [
    'Breaking is a property of a change and a client together: in this matrix, adding a field breaks a strict reader and no other client.',
    'An additive-change policy is a promise about readers as much as about the server: a tolerant reader survives a new field, a strict one does not.',
    'A version in the URL, a header or a date changes where the version is read, while the number of live versions depends on release cadence and migration time.',
    'A sunset needs a date, a way to see who has not moved and a plan for the client nobody owns: extending, a brownout or breaking it each has a cost.',
  ],
  quiz: [
    {
      q: 'A team adds an optional field to a JSON response and calls it non-breaking. Which client in this lesson fails?',
      options: [
        'The partner integration that validates a closed schema',
        'The mobile app that reads only name and email',
        'The web page that formats id, name and created',
        'The batch job that reads the first two values of each object',
      ],
      answer: 0,
      why: 'A closed schema rejects any property it does not list, while the mobile app and the web page ignore what they do not use. The batch job reads values by position, and a field added at the end does not move the first two.',
    },
    {
      q: 'A team moves its API to /v2 URLs. What do they still have to do?',
      options: [
        'Keep v1 running until its clients have migrated',
        'Nothing, because old clients move to v2 by themselves',
        'Nothing, because the new URL stops caches serving stale data',
        'Delete v1 as soon as v2 passes its test suite',
      ],
      answer: 0,
      why: 'Where the version sits does not change how many versions are live: that follows from how often you release and how long clients take to move. Clients move on their own schedule, and deleting v1 early breaks the ones that have not.',
    },
    {
      q: 'A v1 client and a v2 client request the same URL through a shared cache, differing only by a version header, and the response has no Vary header. What can happen?',
      options: [
        'The cache serves the v2 client the stored v1 body',
        'The cache refuses to store either response',
        'The origin answers both requests, each with its own version',
        'The cache adds the version header to its key on its own',
      ],
      answer: 0,
      why: 'A cache keys on the URL unless Vary names more request headers, so the second request is a hit on the first body and never reaches the origin. A Vary: Api-Version response is what tells it to keep the versions apart.',
    },
    {
      q: 'What does a brownout do in this lesson\'s model?',
      options: [
        'It nudges clients that read alerts, at the cost of planned failures',
        'It migrates every client, including one that nobody owns',
        'It moves the sunset date later by the length of the brownout',
        'It replaces the Sunset header with a louder warning',
      ],
      answer: 0,
      why: 'In this model a client that notices a brownout migrates a week later, and the brownout itself fails calls from the clients still on v1. The batch job nobody owns does not notice, so it is still on v1 when the version goes.',
    },
    {
      q: 'The API renames name to fullName. Which client still works?',
      options: [
        'The batch job, which reads the first two values by position',
        'The mobile app, because it ignores fields it does not know',
        'The partner integration, because it only checks types',
        'The web page, because it formats whatever name it finds',
      ],
      answer: 0,
      why: 'The mobile app, the partner integration and the web page each look for a field called name and fail when it is gone. Reading by position survives the rename, and would break the day a field is inserted before it.',
    },
  ],
};

export default lesson;
