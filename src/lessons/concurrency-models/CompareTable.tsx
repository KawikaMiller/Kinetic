import { useMemo } from 'react';
import { ms } from '../../core/format';
import { RUNTIMES, refusal, simulate, type Params, type Run } from './model';

/** All four runtimes on the same workload and the same fault, one row each: the comparison the Gantt cannot show at once. */
export function CompareTable({ params }: { params: Params }) {
  const rows = useMemo(
    () =>
      RUNTIMES.map(({ id, label }) => {
        const p = { ...params, runtime: id };
        return { id, label, problem: refusal(p), run: refusal(p) ? null : simulate(p) };
      }),
    [params],
  );
  const cell = (run: Run | null, f: (r: Run) => string) => (run ? f(run) : '–');
  return (
    <div className="cm-compare">
      <table className="data-table" aria-label="The four runtimes on the same workload">
        <thead>
          <tr>
            <th>Runtime</th>
            <th>Wall time</th>
            <th>Finished</th>
            <th>Peak</th>
            <th>Bystander</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.id === params.runtime ? 'cm-now' : undefined} aria-current={r.id === params.runtime ? 'true' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{cell(r.run, (x) => ms(x.makespan))}</td>
              <td>{cell(r.run, (x) => `${x.finished} / ${params.requests}`)}</td>
              <td>{cell(r.run, (x) => String(x.peakConcurrent))}</td>
              <td>{cell(r.run, (x) => (x.bystanderFinish === null ? '–' : ms(x.bystanderFinish)))}</td>
              <td>{cell(r.run, (x) => `${x.memoryMb} MB`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.problem) && <p className="hint is-muted">{rows.find((r) => r.problem)?.problem}</p>}
    </div>
  );
}
