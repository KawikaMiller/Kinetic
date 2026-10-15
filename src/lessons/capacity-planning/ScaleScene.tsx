import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText, sig } from '../distributions/fmt';
import { rps, scaleCaption } from './frames';
import {
  DB_LIMIT_RANGE, DB_NO_LIMIT, INSTANCES_RANGE, OPTIMISE_RANGE, SCALE_INSTANCES, SERVICE_DEFAULT, SLO_MS, kneeLoad, optimised, poolRows, scaledCapacity,
} from './model';

const INSTANCES_SHOWN = { min: 1, max: SCALE_INSTANCES, step: INSTANCES_RANGE.step };

export function ScaleScene({ picker }: { picker: ReactNode }) {
  const [cut, setCut] = useState(0);
  const [instances, setInstances] = useState(10);
  const [dbLimit, setDbLimit] = useState<number>(DB_NO_LIMIT);
  const service = optimised(SERVICE_DEFAULT, cut);
  const knee = kneeLoad(service, SLO_MS) ?? 0;
  const limited = dbLimit < DB_NO_LIMIT;
  const total = scaledCapacity(service, instances, dbLimit);
  const rows = poolRows(service.serviceMs);
  const top = Math.max(SCALE_INSTANCES * knee, dbLimit < DB_NO_LIMIT ? dbLimit : 0) * 1.05;

  useIntroCaption(scaleCaption(SERVICE_DEFAULT, cut, instances, dbLimit), [cut, instances, dbLimit]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Knee of one instance" value={rps(knee)} color="var(--hi)" sub={[`${SERVICE_DEFAULT.workers} workers, ${sig(service.serviceMs)} ms each`, `p99 within ${SLO_MS} ms`]} />
          <Stat label={`${instances} instances take`} value={rps(total)} color="var(--ok)" sub={[limited ? `the shared database stops it at ${rps(dbLimit)}` : 'no shared limit set']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'if capacity were linear', shape: 'line' },
            { color: 'var(--ok)', label: 'with the shared limit', shape: 'line' },
            { color: 'var(--bad)', label: 'shared database limit', shape: 'line' },
            { color: 'var(--hi)', label: 'your instances', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Optimise service time" value={cut} {...OPTIMISE_RANGE} format={(v) => `${pctText(v, 0)} faster`} onChange={setCut} />
        </>,
        <>
          <Slider label="Instances" value={instances} {...INSTANCES_SHOWN} onChange={setInstances} />
          <Slider label="Shared database limit" value={dbLimit} {...DB_LIMIT_RANGE} format={(v) => (v >= DB_NO_LIMIT ? 'no limit' : rps(v))} onChange={setDbLimit} />
        </>,
      ]}
    >
      <div className="cp-stage stage-pad">
        <Plot2D
          x={{ domain: [1, SCALE_INSTANCES], label: 'instances', ticks: 5 }}
          y={{ domain: [0, top], label: 'requests/s at the objective', format: (v) => sig(v, 3), ticks: 4 }}
          ariaLabel={`Capacity at the objective against instances: ${rps(total)} with ${instances}`}
        >
          <Curve fn={(n) => n * knee} tone="dim" dashed />
          <Curve fn={(n) => scaledCapacity(service, n, dbLimit)} tone="ok" />
          {limited && <HLine at={dbLimit} tone="bad" label="database limit" />}
          <VLine at={instances} tone="hi" onDrag={(x) => setInstances(Math.min(SCALE_INSTANCES, Math.max(1, Math.round(x))))} onStep={(d) => setInstances((n) => Math.min(SCALE_INSTANCES, Math.max(1, n + d)))} ariaLabel="Instances" valueText={`${instances} instances, ${rps(total)}`} />
        </Plot2D>
        <Box className="cp-pool">
          <SectionTitle hint={`${sig(service.serviceMs)} ms per request, p99 within ${SLO_MS} ms`}>How hot can the workers run? Safe utilisation</SectionTitle>
          <table className="data-table cp-table">
            <thead>
              <tr>
                <th>workers</th>
                <th>one pool</th>
                <th>as separate queues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.workers}>
                  <th scope="row">{r.workers}</th>
                  <td className={r.pooled !== null && r.workers > 1 ? 'cp-better' : ''}>{r.pooled === null ? 'none' : pctText(r.pooled, 0)}</td>
                  <td>{r.separate === null ? 'none' : pctText(r.separate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>
            One pool behind one queue tolerates running hotter than the same workers as separate queues, because no worker idles while a request waits. Capacity is not linear in instances either
            once something shared, like a database, has its own limit.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">{SERVICE_DEFAULT.workers} workers of 50 ms each, the objective and the database limits are made up</Provenance>
          <Provenance kind="from-memory">pooling lowers waiting at the same utilisation: verify against a queueing text</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
