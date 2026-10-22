import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CDN keeps copies of your content on servers all over the world, so users are served from a city near them instead of crossing an ocean to your origin.',
    what: "A content delivery network runs many edge locations (points of presence, or PoPs). Users are sent to a nearby one (in the lesson, the nearest by distance; real networks route by DNS or anycast, which is not always the nearest). If that edge has a fresh copy of the file, it answers immediately (a hit); if not (a miss), it fetches from your origin server, returns it, and keeps a copy until its TTL expires. An origin shield adds a mid-tier cache in front of the origin, so misses from many edges collapse into one origin request. Purging (invalidation) wipes cached copies when content changes.",
    analogy: 'Instead of every customer driving to the one central warehouse, the company stocks popular items in local shops. The shops reorder from the warehouse only when they run out or the stock goes stale.',
    useCases: [
      'Serving images, JavaScript, CSS and video for sites with users far from their servers',
      'Absorbing traffic spikes, and some kinds of attack traffic, at the edge before it reaches the origin',
      'Cutting origin costs and load: the higher the hit ratio, the smaller the share of traffic the origin sees',
      'Edge compute (Cloudflare Workers, Lambda@Edge: from memory, check the vendors) running code close to users',
    ],
    why: "Teams decide what is cacheable, for how long and how it gets invalidated, and those choices shape latency for global users and the origin's bill. Getting cache headers or purges wrong causes stale-content bugs or a stampede of misses that can take the origin down.",
    watch: "Dots are requests. Blue ones travel from a user to the nearest edge (the blue-outlined circles), green ones are served straight from that edge (hits), and red ones are misses that go on to the violet origin diamond in Virginia and back, through the orange shield dot when the shield is on. The green ring around each edge shows how full its cache is, and an edge glows green on a hit. The white-outlined edge is the one in the side panel, whose TTL bars drain from green to amber in their last quarter of the TTL (all bars share one length: the TTL, or the longest time left on a copy cached under an older, longer TTL after you lower the slider). The box in the corner is origin load, in violet, the same number as the Origin load stat. Latency counts one round trip per hop and ignores connection handshakes. The chips say users and files are seeded random and the geography and timings are illustrative.",
  },
  tryThis: [
    'Watch the first few seconds: the first request for each file at each edge is a miss, so the hit ratio starts low and climbs as the caches warm up.',
    'Switch to No CDN and compare p50 latency and origin load: the origin now hears every request.',
    'Hit Purge all caches and watch the origin load spike, then settle.',
    'Set TTL to 3 s, then turn on the origin shield. What happens to origin load?',
  ],
  keyIdeas: [
    'For a cached file, latency is mostly distance: serving from nearby beats a faster origin far away.',
    'Hit: served from the edge. Miss: fetched from the origin, then cached.',
    'A longer TTL raises the hit ratio but lets a copy go stale for up to the TTL; a purge forces a refetch.',
    'An origin shield collapses misses from many edges into one origin fetch per file per TTL.',
  ],
  quiz: [
    {
      q: 'Why does a CDN make pages faster for a user in Sydney when your origin is in Virginia?',
      options: [
        'It compresses the files so much more than the origin that they download sooner',
        'A nearby edge answers cache hits, so most requests skip the long round trip',
        "It upgrades the user's connection to a faster internet link",
        'It skips the DNS lookup that a visit to the origin needs',
      ],
      answer: 1,
      why: 'In this model a round trip from Sydney to Virginia takes over 200 ms, while an edge in Sydney answers a hit in about ten ms.',
    },
    {
      q: 'You deploy a new logo, but the CDN\'s edges still return the old one. What is the likely cause?',
      options: [
        'The origin is down, so the edges quietly fall back to an older build of the site',
        'DNS changes have not reached the visitor\'s resolver yet',
        'Edges keep serving the cached copy until its TTL runs out or it is purged',
        'The browser cached the logo itself, so the request never even reaches the CDN',
      ],
      answer: 2,
      why: 'Edges keep serving the old file until it expires or you purge it. Many teams put a version in the file name (logo.v2.png) so each deploy gets a new URL.',
    },
    {
      q: 'What does an origin shield mainly reduce?',
      options: [
        'The latency of cache hits, which are already answered at the edge',
        'The number of requests that reach the origin from many edges',
        'The TLS handshake time that each new visitor pays to the edge',
        "How often the visitor's browser has to look up a DNS name",
      ],
      answer: 1,
      why: 'Edges fetch misses through one shield cache, so a file missing in nine cities costs one origin fetch instead of nine.',
    },
    {
      q: 'A team sets a TTL of a few seconds to avoid stale content and leaves the shield off. What happens to the origin?',
      options: [
        'Nothing changes, since the hit ratio depends on file size and not on the TTL setting',
        'It sees less traffic, since each edge checks fresh copies against the origin more often',
        'The edges stop caching for good, because a short TTL marks the files as private',
        'It serves a large share of traffic again, since copies expire before repeats arrive',
      ],
      answer: 3,
      why: 'A short TTL expires entries before many repeat requests arrive. In this model a 3 s TTL leaves the hit ratio around 30% and the origin serving over half of the traffic; a longer TTL or a shield brings that down.',
    },
  ],
};

export default lesson;
