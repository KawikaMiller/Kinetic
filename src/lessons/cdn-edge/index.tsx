import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A CDN keeps copies of your content on servers all over the world, so users are served from a city near them instead of crossing an ocean to your origin.',
    what: "A content delivery network runs many edge locations (points of presence, or PoPs). Users are routed to the nearest one. If that edge has a fresh copy of the file, it answers immediately (a hit); if not (a miss), it fetches from your origin server, returns it, and keeps a copy until its TTL expires. An origin shield adds a mid-tier cache in front of the origin, so misses from many edges collapse into one origin request. Purging (invalidation) wipes cached copies when content changes.",
    analogy: 'Instead of every customer driving to the one central warehouse, the company stocks popular items in local shops. The shops reorder from the warehouse only when they run out or the stock goes stale.',
    useCases: [
      'Serving images, JavaScript, CSS and video for any site with users far from its servers',
      'Absorbing traffic spikes and DDoS attacks at the edge before they reach the origin',
      'Cutting origin costs and load; with high hit ratios the origin sees a tiny fraction of traffic',
      'Edge compute (Cloudflare Workers, Lambda@Edge) running code close to users',
    ],
    why: "Senior engineers decide what is cacheable, for how long and how it gets invalidated, and those choices dominate latency for global users and the origin's bill. Getting cache headers or purges wrong causes stale-content bugs or a stampede of misses that can take the origin down.",
    watch: 'Dots are requests. Blue ones travel from a user to the nearest edge, green ones are served straight from that edge (hits), and amber ones are misses that go all the way to the violet origin in Virginia and back. The green ring around each edge shows how full its cache is, and the side panel lists one edge\'s cached files with TTL bars draining. The sparkline in the corner is origin load. Latency counts one round trip per hop and ignores connection handshakes.',
  },
  tryThis: [
    "Watch the first few seconds: everything misses until the caches warm up.",
    'Switch to No CDN and compare p50 latency and origin load.',
    'Hit Purge all caches and watch the origin load spike, then settle.',
    'Set TTL to 3 s, then turn on the origin shield. What happens to origin load?',
  ],
  keyIdeas: [
    'Latency is mostly distance: serving from nearby beats a faster origin far away.',
    'Hit: served from the edge. Miss: fetched from the origin, then cached.',
    'TTL trades freshness against hit ratio; purges force a refetch.',
    'An origin shield collapses misses from many edges into one origin request.',
  ],
  quiz: [
    {
      q: 'Why does a CDN make pages faster for a user in Sydney when your origin is in Virginia?',
      options: ['It compresses files better', 'Most requests are answered by a nearby edge, avoiding the long round trip', 'It upgrades their internet', 'It skips DNS'],
      answer: 1,
      why: 'A round trip across the Pacific costs hundreds of milliseconds. An edge in Sydney answers a cache hit in a few milliseconds.',
    },
    {
      q: 'You deploy a new logo but users keep seeing the old one. What is the likely cause?',
      options: ['The origin is down', 'Edges are serving the cached copy until its TTL expires', 'DNS propagation', 'The CDN is off'],
      answer: 1,
      why: 'Edges keep serving the old file until it expires or you purge it. Many teams put a version in the file name (logo.v2.png) so every deploy gets a new URL.',
    },
    {
      q: 'What does an origin shield primarily reduce?',
      options: ['Latency on cache hits', 'The number of requests reaching the origin', 'TLS handshake time', 'DNS lookups'],
      answer: 1,
      why: 'Edges fetch misses through one shield cache, so a file missing in nine cities costs one origin fetch instead of nine.',
    },
  ],
};

export default lesson;
