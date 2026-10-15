import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plainTone, type PlainTone } from '../../core/tone';
import { poolCaption } from './frames';
import {
  MU, POOL_DEFAULT, POOL_MEASURED_JOBS, POOL_RHO, POOL_SERVERS, TOPOLOGIES, TOPOLOGY_NAME, TOPOLOGY_SHORT, measurePool, topologyTheory, type Topology,
} from './model';
import { pctText, sig } from '../../core/format';
import { SeedField } from '../../components/SeedField';

const TONE: Record<Topology, PlainTone> = { split: plainTone(0), pool: plainTone(1), fast: plainTone(2) };
const BOX = 14;
const LANE = 22;

/** A small picture of one topology: arrivals on the left, queue boxes, then the servers. */
function Diagram({ topology }: { topology: Topology }) {
  const lanes = topology === 'pool' ? 1 : topology === 'split' ? POOL_SERVERS : 1;
  const servers = topology === 'fast' ? 1 : POOL_SERVERS;
  const height = Math.max(lanes, servers) * LANE + 8;
  const queueY = (i: number) => 4 + (height - 8) / (lanes + 1) * (i + 1) - BOX / 2;
  const serverY = (i: number) => 4 + (height - 8) / (servers + 1) * (i + 1) - (topology === 'fast' ? BOX * 1.6 : BOX) / 2;
  return (
    <svg className="qt-diagram" viewBox={`0 0 150 ${height}`} aria-hidden="true">
      {Array.from({ length: lanes }, (_, i) => (
        <rect key={`q${i}`} className="qt-box-queue" x={20} y={queueY(i)} width={46} height={BOX} rx={3} />
      ))}
      {Array.from({ length: servers }, (_, i) => (
        <rect key={`s${i}`} className="qt-box-server" x={96} y={serverY(i)} width={topology === 'fast' ? 44 : 30} height={topology === 'fast' ? BOX * 1.6 : BOX} rx={4} />
      ))}
    </svg>
  );
}

export function PoolScene({ picker }: { picker: ReactNode }) {
  const [rho, setRho] = useState(POOL_DEFAULT.rho);
  const [seed, setSeed] = useState(POOL_DEFAULT.seed);

  const analytic = Object.fromEntries(TOPOLOGIES.map((t) => [t, topologyTheory(t, rho)])) as Record<Topology, ReturnType<typeof topologyTheory>>;
  const measured = useMemo(() => measurePool(rho, seed), [rho, seed]);

  useIntroCaption(poolCaption(rho), [rho]);

  const best = (pick: (t: Topology) => number): Topology => TOPOLOGIES.reduce((a, b) => (pick(b) < pick(a) ? b : a));
  const bestWait = best((t) => analytic[t].Wq);
  const bestSystem = best((t) => analytic[t].W);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={<><span className="keep-case">ρ</span> per server</>} value={pctText(rho, 0)} sub={[`λ = ${sig(POOL_SERVERS * rho * MU)}/s in total`, `capacity ${POOL_SERVERS} × ${MU} = ${POOL_SERVERS * MU}/s each way`]} />
          <Stat label="Shortest wait" value={TOPOLOGY_NAME[bestWait]} sub={[`${sig(analytic[bestWait].Wq)} s, analytic`]} color="var(--ok)" />
          <Stat label="Shortest time in system" value={TOPOLOGY_NAME[bestSystem]} sub={[`${sig(analytic[bestSystem].W)} s, analytic`]} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...TOPOLOGIES.map((t) => ({ color: `var(--${TONE[t]})`, label: TOPOLOGY_NAME[t] })),
            { color: 'var(--ok)', label: 'the shorter time in a column' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Utilisation ρ per server" value={rho} {...POOL_RHO} format={(v) => pctText(v, 0)} onChange={setRho} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="qt-stage stage-pad">
        <div className="qt-topologies">
          {TOPOLOGIES.map((t) => (
            <Box key={t} className="qt-topology" style={{ '--c': `var(--${TONE[t]})` } as CSSProperties}>
              <SectionTitle>{TOPOLOGY_NAME[t]}</SectionTitle>
              <Diagram topology={t} />
            </Box>
          ))}
        </div>
        <Box className="qt-compare">
          <SectionTitle hint="mean seconds, same total capacity, the same arrival times and the same service draws">The same load, three layouts</SectionTitle>
          <table className="data-table">
            <thead>
              <tr>
                <th>layout</th>
                <th>wait, theory</th>
                <th>wait, sim</th>
                <th>system, theory</th>
                <th>system, sim</th>
              </tr>
            </thead>
            <tbody>
              {TOPOLOGIES.map((t) => (
                <tr key={t} style={{ '--c': `var(--${TONE[t]})` } as CSSProperties}>
                  <td className="qt-layout">{TOPOLOGY_SHORT[t]}</td>
                  <td className={t === bestWait ? 'qt-best' : ''}>{sig(analytic[t].Wq)}</td>
                  <td>{sig(measured[t].Wq)}</td>
                  <td className={t === bestSystem ? 'qt-best' : ''}>{sig(analytic[t].W)}</td>
                  <td>{sig(measured[t].W)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>
            Pooling beats splitting because, in this model, no server sits idle while a job waits in the shared queue. Join-the-shortest-queue is a middle way that load balancing owns.
            The measured columns are one seeded run of {POOL_MEASURED_JOBS.toLocaleString('en-US')} jobs per layout, all three fed the same arrivals and service draws (the fast server does each job in 1/{POOL_SERVERS} of the time), so they differ only by layout; each still wobbles from seed to seed, most at high ρ.
          </Hint>
        </Box>
        <div className="qt-chips">
          <Provenance kind="simulated" seed={seed}>measured: {POOL_MEASURED_JOBS.toLocaleString('en-US')} seeded jobs per layout, same arrivals</Provenance>
          <Provenance kind="illustrative">c = {POOL_SERVERS} servers, μ = {MU}/s each: made-up numbers</Provenance>
          <Provenance kind="from-memory">M/M/1 and Erlang C formulas: verify against a queueing text</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
