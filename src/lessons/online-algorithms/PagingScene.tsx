import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { K_VALUES, MAX_REQUESTS, addRequest, autopilot, lruRun, pagingScore, type CacheSize } from './model';

const K_OPTIONS = K_VALUES.map((k) => ({ value: k, label: `cache of ${k}` }));
const REQUEST_CELL_PX = 26;
const AUTOPILOT_SHORT = 12;
const AUTOPILOT_LONG = 30;
const NO_REQUESTS: readonly number[] = [];

/** Scene 3: paging. The learner (or the autopilot) requests pages; LRU and the offline optimum answer the same sequence. */
export function PagingScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState<CacheSize>(3);
  const [requests, setRequests] = useState<readonly number[]>(NO_REQUESTS);
  const [refusal, setRefusal] = useState<string | null>(null);
  const run = useMemo(() => lruRun(requests, k), [requests, k]);
  const score = useMemo(() => pagingScore(requests, k), [requests, k]);
  const last = run.steps[run.steps.length - 1];
  const cache = last?.cache ?? NO_REQUESTS;
  const pages = Array.from({ length: k + 1 }, (_, i) => i + 1);

  const request = (page: number) => {
    const result = addRequest(requests, page, k);
    if (result.ok) {
      setRequests(result.requests);
      setRefusal(null);
    } else {
      setRefusal(result.error);
    }
  };
  const auto = (count: number) => {
    const next = autopilot(requests, k, count);
    setRequests(next);
    setRefusal(requests.length + count > MAX_REQUESTS ? `The sequence is capped at ${MAX_REQUESTS} requests: press Reset to start again.` : null);
  };
  const reset = () => {
    setRequests(NO_REQUESTS);
    setRefusal(null);
  };
  const changeK = (next: CacheSize) => {
    setK(next);
    reset();
  };

  return (
    <StageFrame
      height={460}
      intro={
        requests.length === 0
          ? <>Request pages 1 to {k + 1} one at a time, with room for {k} in the cache. LRU evicts the page unused for longest; the optimum knows the whole sequence in advance.</>
          : <>After {requests.length} {requests.length === 1 ? 'request' : 'requests'}, LRU has missed {score.lru} times and the optimum {score.optimum}{score.ratio !== null ? `, a ratio of ${score.ratio.toFixed(2)} against k = ${k}` : ''}.</>
      }
      introKey={`paging|${k}|${requests.join(',')}`}
      stats={
        <Stats>
          <Stat label="LRU misses" value={score.lru} color="var(--bad)" sub={`of ${score.requests} requests`} />
          <Stat label="Optimum misses" value={score.optimum} color="var(--ok)" sub="offline, farthest in the future out" />
          <Stat label="Ratio" value={score.ratio === null ? '–' : score.ratio.toFixed(2)} color="var(--hi)" sub={`k = ${k}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a hit', shape: 'square' },
            { color: 'var(--bad)', label: 'a miss', shape: 'square' },
            { color: 'var(--hi)', label: 'the newest request', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Cache" value={k} onChange={changeK} options={K_OPTIONS} />
        </>,
        <>
          {pages.map((p) => (
            <Button key={p} onClick={() => request(p)} aria-label={`Request page ${p}`}>Request {p}</Button>
          ))}
          <Button variant="primary" onClick={() => auto(AUTOPILOT_SHORT)}>Autopilot x {AUTOPILOT_SHORT}</Button>
          <Button onClick={() => auto(AUTOPILOT_LONG)}>Autopilot x {AUTOPILOT_LONG}</Button>
          <Button onClick={reset}>Reset</Button>
          <Hint tone={refusal ? 'bad' : 'faint'}>
            <span role="status">{refusal ?? 'Autopilot always requests the lowest-numbered page that is not in LRU\'s cache.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="oa-stage stage-pad">
        <div className="oa-array">
          <span className="oa-rowlabel">LRU cache, least recently used first</span>
          <ArrayStrip
            values={Array.from({ length: k }, (_, i) => cache[i] ?? '')}
            cellState={(i) => (last && cache[i] === last.page ? (last.hit ? 'done' : 'bad') : 'idle')}
            fontSize={14}
            cellMax={48}
          />
        </div>
        <div className="oa-array">
          <span className="oa-rowlabel">Requests</span>
          <WideRegion
            minWidth={Math.max(320, requests.length * REQUEST_CELL_PX)}
            label="Requests: scroll sideways to see all of them"
            gutter={{ top: 4, bottom: 22, x: 4 }}
            reveal={{ from: Math.max(0, requests.length - 1) / Math.max(1, requests.length), to: 1 }}
          >
            <ArrayStrip
              values={requests.length ? requests : ['']}
              showIndex
              fontSize={12}
              cellMax={REQUEST_CELL_PX + 6}
              cellState={(i) => (i >= run.steps.length ? 'idle' : i === run.steps.length - 1 ? 'active' : run.steps[i].hit ? 'done' : 'bad')}
            />
          </WideRegion>
        </div>
        <p className="oa-note">
          With {k + 1} pages and room for {k}, one page is out of the cache, and the autopilot asks for exactly that page, so LRU misses on every autopilot request.
          The optimum sees the whole sequence in advance and evicts the page needed farthest ahead. Cold-start misses count for both.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: LRU and the offline optimum run on the sequence you built</Provenance>
        <ClaimLabel kind="theorem">LRU is k-competitive and no deterministic paging rule does better (Sleator and Tarjan, 1985, named from memory; verify against the CACM paper)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
