import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'DNS answers are cached everywhere for as long as their TTL says, which is why lookups are fast, why changes are slow, and why "it\'s always DNS".',
    what: '`web-request` showed the walk from the root to the authoritative server. This lesson is about what the recursive resolver keeps. Every answer carries a TTL, and the resolver serves it from cache until that runs out, along with the referrals it learned on the way. Even "this name doesn\'t exist" (NXDOMAIN) is cached, for the SOA record\'s negative TTL. A zone holds several record types: A and AAAA for addresses, CNAME for aliases, MX for mail, TXT for text, and NS and SOA for the zone itself. When you change a record, nothing is pushed into resolver caches: each resolver keeps its old copy until its own TTL expires. (Your provider\'s own name servers do sync with each other, usually within seconds via NOTIFY; that isn\'t what holds users on the old address.)',
    analogy: 'A company phone list that every office photocopies. Change a number at head office and each office keeps dialling the old one until its copy says "replace me", and some offices copied it yesterday.',
    useCases: [
      'Planning a migration: lower the TTL at least one old TTL (often a day) ahead, then switch',
      'Debugging "works for me, not for them" after a DNS change',
      'Setting up email (MX and SPF-style TXT records) or a CDN (CNAME)',
      'Telling a typo (NXDOMAIN) from a down name server (SERVFAIL) in an outage',
    ],
    why: 'DNS is behind a surprising share of outages and confusing bugs: a change "that didn\'t work", a new subdomain that says not found, a CNAME with a typo. Knowing what is cached, where and for how long turns guesswork into a timeline you can predict. It builds on `web-request` and `ip-ports`; the AAAA records connect to `ipv6`.',
    watch: 'Resolve: the ladder has lifelines for your laptop, the resolver, the root, the .com TLD and example.com\'s two name servers, ns1 and ns2. Queries are blue, referrals and CNAMEs violet, and answers (including answers served from cache) green. The message being explained now keeps its colour and sits on a yellow band, so a cache hit still reads green. NXDOMAIN is red; a timeout is an orange arrow that stops with a ✕, and SERVFAIL is orange too, because it is the second kind of failure (no answer at all, rather than "no such name"). In the resolver cache, each entry has a bar showing how much of its TTL is left: blue for answers, violet for referrals, red for cached negative answers (an NXDOMAIN shows "(any type)", since it covers the whole name), and yellow (with a yellow name) for the entry that just answered. Change a record: one lane per resolver, grey while the old IP is still correct, orange once it\'s stale, and green from the moment that resolver sees the new IP. The yellow marker is the moment of the change, and the table\'s green column says when each resolver switches.',
  },
  tryThis: [
    'Look up example.com A, then press Look up again: compare the two ladders.',
    'Now look up example.com MX: which servers does the resolver skip, and why?',
    'Look up www.example.com A (one reply carries the CNAME and the A), then shop.example.com A, whose CNAME points into another zone: read its target closely.',
    'Pick new.example.com A and look it up, then try new.example.com AAAA. Press Create, look it up again, then press "Wait 10 min" and try once more.',
    'Set the name servers to "ns1 down", then "Both down", and look up example.com MX each time. Then, in Change a record, try the Lower the TTL options and watch the orange shrink.',
  ],
  keyIdeas: [
    'A resolver caches every answer, referral and "not found" for its TTL, so most lookups never leave it.',
    'Nothing pushes a change into resolver caches: each keeps its old copy until its own TTL runs out, so (for caches that honour TTLs) a change is fully seen one TTL later. OS and app caches and long-lived connections can hold the old IP longer, so keep the old server up through that window.',
    'Lower the TTL at least one old TTL before a migration; lowering it at the moment of the change helps nobody who already cached it.',
    'NXDOMAIN ("no such name", cached for the SOA negative TTL) and SERVFAIL ("couldn\'t get an answer") are different failures.',
  ],
  quiz: [
    {
      q: 'You changed example.com\'s A record ten minutes ago, and some users still reach the old server. Why?',
      options: [
        'Their resolvers cached the old answer and its TTL hasn\'t run out',
        'The change is still being copied out to the root servers',
        'The authoritative server takes a day to publish its edits',
        'Browsers ignore DNS changes until the computer restarts',
      ],
      answer: 0,
      why: 'Root servers never hold example.com\'s records; they only point to .com. Your provider\'s own servers had the change within seconds, but nothing pushes it into resolver caches: resolvers that cached the old answer keep serving it until their own TTL expires.',
    },
    {
      q: 'example.com has a 1-day TTL. You lower it to 60 s at the same moment you switch IPs. How long can resolvers keep serving the old IP?',
      options: ['Up to 1 day', 'Up to 60 seconds', 'Exactly 60 seconds', 'Not at all'],
      answer: 0,
      why: 'Resolvers that cached the record before the change hold it with the old 1-day TTL and won\'t see the new TTL until they re-fetch. Lowering the TTL only helps if it\'s done at least one old TTL ahead.',
    },
    {
      q: 'Which record type makes www.example.com an alias for example.com?',
      options: ['CNAME', 'A', 'MX', 'NS'],
      answer: 0,
      why: 'A CNAME says "this name is another name; look that one up instead". A holds an IPv4 address, MX names a mail server, and NS names the zone\'s authoritative servers.',
    },
    {
      q: 'A lookup for new.example.com got NXDOMAIN. A minute later you create the record, but the resolver still says NXDOMAIN. Why?',
      options: [
        'It cached the "not found" answer for the SOA\'s negative TTL',
        'New records need about a day to reach the root servers first',
        'The resolver only checks for new names once every hour',
        'NXDOMAIN means the name is blocked by the resolver itself',
      ],
      answer: 0,
      why: 'Negative answers are cached too, for the lesser of the SOA record\'s TTL and its MINIMUM field (RFC 2308). Root servers never hold records for example.com; they only refer the resolver onwards.',
    },
    {
      q: 'All of a name\'s authoritative servers stop answering. What does the client get, once the resolver gives up?',
      options: ['SERVFAIL: no answer could be had', 'NXDOMAIN: the name does not exist', 'NOERROR, with an empty answer', 'An answer from the root servers'],
      answer: 0,
      why: 'With every server timing out, the resolver never learned anything, so it reports SERVFAIL (if only one of several servers is down, it just tries the next). NXDOMAIN would be a definite "this name doesn\'t exist", which nobody said. Mixing the two up sends you looking for a typo when a server is down.',
    },
  ],
};

export default lesson;
