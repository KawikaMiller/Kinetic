import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { SEGMENT } from './abr';
import { cdnCaption } from './captions';
import { CACHE, CATALOGUE, LIVE, POPULAR_RANK, REQUESTS, TAIL_RANK, ZIPF, liveLatency, replay, requestStream, titleRatio, type Replay } from './cdn';
import { initialCdn } from './init';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a cache hit: served from the edge' },
      { color: 'var(--bad)', label: 'a miss: the origin has to serve it' },
      { color: 'var(--info)', label: 'the live delay, in seconds' },
    ]}
  />
);

const BUCKETS: { label: string; from: number; to: number }[] = [
  { label: `ranks ${POPULAR_RANK} to 10`, from: 1, to: 10 },
  { label: 'ranks 11 to 50', from: 11, to: 50 },
  { label: `ranks 51 to ${CATALOGUE}`, from: 51, to: CATALOGUE },
];

function bucketRatio(r: Replay, from: number, to: number): { requests: number; ratio: number | null } {
  let requests = 0;
  let hits = 0;
  for (let rank = from; rank <= to; rank++) {
    const s = r.byTitle.get(rank);
    if (s) {
      requests += s.requests;
      hits += s.hits;
    }
  }
  return { requests, ratio: requests > 0 ? hits / requests : null };
}

export function CdnScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialCdn);
  const stream = useMemo(() => requestStream(st.seed, st.alpha), [st.seed, st.alpha]);
  const r = useMemo(() => replay(stream, st.cache), [stream, st.cache]);
  const pop = titleRatio(r, POPULAR_RANK);
  const tail = titleRatio(r, TAIL_RANK);
  const live = liveLatency(st.S);
  const pctText = (x: number | null) => (x === null ? 'no requests' : `${Math.round(x * 100)}%`);

  return (
    <StageFrame
      height={640}
      legend={LEGEND}
      intro={cdnCaption(r)}
      introKey={`${st.seed}|${st.alpha}|${st.cache}`}
      stats={
        <Stats>
          <Stat label="Overall hit ratio" value={pctText(r.hitRatio)} color="var(--ok)" sub={`${r.hits.toLocaleString('en-US')} of ${r.requests.toLocaleString('en-US')} requests`} />
          <Stat label={`Title ${POPULAR_RANK} (most popular)`} value={pctText(pop.ratio)} color="var(--ok)" sub={`${pop.requests.toLocaleString('en-US')} requests`} />
          <Stat label={`Title ${TAIL_RANK} (long tail)`} value={pctText(tail.ratio)} color="var(--bad)" sub={`${tail.requests.toLocaleString('en-US')} requests`} />
          <Stat label="Served by the origin" value={r.misses.toLocaleString('en-US')} color="var(--bad)" sub={`${Math.round((r.misses / r.requests) * 100)}% of the ${REQUESTS.toLocaleString('en-US')} requests`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <SeedField seed={st.seed} onSeed={(seed) => setSt((s) => ({ ...s, seed }))} />
        </>,
        <>
          <Slider label="Popularity skew (Zipf exponent)" value={st.alpha} min={ZIPF.min} max={ZIPF.max} step={ZIPF.step} format={(n) => n.toFixed(1)} onChange={(alpha) => setSt((s) => ({ ...s, alpha }))} />
          <Slider label="Cache size" value={st.cache} min={CACHE.min} max={CACHE.max} step={CACHE.step} format={(n) => `${n.toLocaleString('en-US')} segments`} onChange={(cache) => setSt((s) => ({ ...s, cache }))} />
          <Slider label="Segment length" value={st.S} min={SEGMENT.min} max={SEGMENT.max} format={(n) => `${n} s`} onChange={(S) => setSt((s) => ({ ...s, S }))} />
        </>,
      ]}
    >
      <div className="abr-stage stage-pad">
        <Box>
          <SectionTitle hint={`${CATALOGUE} titles of 30 segments; segments are plain HTTP files, so a cache can hold them`}>Hit ratio by how popular the title is</SectionTitle>
          <div className="abr-bars">
            {BUCKETS.map((b) => {
              const x = bucketRatio(r, b.from, b.to);
              return (
                <div key={b.label} className="abr-bar-row">
                  <span className="abr-bar-name">{b.label}</span>
                  <Bar value={x.ratio ?? 0} max={1} tone="ok" ariaLabel={`${b.label}: ${pctText(x.ratio)} of ${x.requests} requests were hits`} />
                  <span className="abr-bar-text">{pctText(x.ratio)} of {x.requests.toLocaleString('en-US')} requests</span>
                </div>
              );
            })}
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`a live player holds back about ${LIVE.segmentsBuffered} segments (from memory)`}>Live against on demand</SectionTitle>
          <div className="abr-scroll" role="region" aria-label="Live and on-demand delay" tabIndex={0}>
            <table className="data-table abr-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Delay behind the source</th>
                  <th scope="col">Worked out</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Live</td>
                  <td className="abr-live">{live} s</td>
                  <td>{LIVE.segmentsBuffered} segments x {st.S} s + {LIVE.pipelineSeconds} s to encode, package and deliver</td>
                </tr>
                <tr>
                  <td>On demand</td>
                  <td>none to speak of</td>
                  <td>the whole file already exists, so the player fills its buffer as fast as the network allows</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="abr-note">Low-latency variants of HLS and DASH use partial segments to cut that delay: named only, verify against the specifications.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>a seeded stream of {REQUESTS.toLocaleString('en-US')} segment requests through an LRU cache</Provenance>
          <Provenance kind="illustrative">the catalogue, the skew, the cache size and the 4 s pipeline time are made up</Provenance>
          <Provenance kind="from-memory">how many segments a live player holds back, and the low-latency variants, are recalled from the HLS and DASH documents: verify against them</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
