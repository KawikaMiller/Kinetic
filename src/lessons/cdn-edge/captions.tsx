import { pct } from '../../core/format';
import { EDGES } from './sim';

export const introCaption = () => (
  <>
    Users all over the world request images and scripts. With a CDN, each request goes to the <b>nearest edge</b> server
    (nearest by distance, a simplification) instead of the origin in Virginia.
  </>
);

export const missCaption = () => (
  <>
    <span className="hl bad">Cache miss</span>: the edge doesn't have a fresh copy yet, so it fetches the file from the origin (red) and keeps a
    copy until its TTL runs out. The <i>next</i> nearby user gets it locally.
  </>
);

/** The caches-are-warm caption, quoting the hit ratio the stat shows. */
export const warmCaption = (hitRatio: number) => (
  <>
    Caches are warm: {pct(hitRatio)} of requests in the last few seconds stopped at the edge (<span className="hl ok">green</span>). The origin
    hears about the rest. Watch its load line.
  </>
);

export const cdnCaption = (on: boolean) =>
  on ? (
    <>CDN back on. The edges kept their copies, so anything still inside its TTL is a hit straight away.</>
  ) : (
    <>
      <span className="hl bad">No CDN</span>: every request goes straight to the origin in Virginia. Watch p50 latency and
      the origin's load.
    </>
  );

export const shieldCaption = (on: boolean, cdnOn: boolean) => {
  if (!cdnOn) return <>The shield sits between the edges and the origin, so it does nothing while the CDN is off.</>;
  return on ? (
    <>
      <span className="hl" style={{ color: 'var(--orange)' }}>Origin shield</span>: edges ask one mid-tier cache near the origin first, so the
      same miss in up to {EDGES.length} cities becomes <b>one</b> origin fetch.
    </>
  ) : (
    <>Shield off: each edge's miss goes straight to the origin.</>
  );
};

export const purgeCaption = () => (
  <>
    <span className="hl bad">Purged!</span> Every edge and the shield are empty, so misses flood the origin until caches refill. Invalidate
    carefully, and ideally only the files that changed.
  </>
);
