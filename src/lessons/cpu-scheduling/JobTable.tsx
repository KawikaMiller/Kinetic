import { useEffect, useRef, useState } from 'react';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, TextField } from '../../components/ui';
import { NA } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { average, formatIo, MAX_ARRIVAL, MAX_BURST, MAX_JOBS, parseIo, STARVE_TICKS, type IoPattern, type Job, type Moment, type Schedule } from './model';
import { jobTone } from './view';

export interface JobRow {
  key: number;
  job: Job;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * One editable cell. The typed text is kept as typed; Enter or leaving the field commits it.
 * A refused value shows its message and the schedule keeps the last good value.
 */
function EditCell<T>({ value, show, label, parse, onCommit, onError, placeholder }: {
  value: T;
  placeholder?: string;
  show: (v: T) => string;
  label: string;
  parse: (s: string) => Parsed<T>;
  onCommit: (v: T) => void;
  onError: (msg: string | null) => void;
}) {
  const [draft, setDraft] = useState(show(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(show(value));
  }
  const commit = () => {
    const r = parse(draft);
    if (r.ok) {
      onError(null);
      if (r.value !== value) onCommit(r.value);
    } else {
      onError(`${label}: ${r.error}`);
    }
  };
  return <TextField ariaLabel={label} value={draft} onChange={setDraft} onEnter={commit} onBlur={commit} width={58} spellCheck={false} placeholder={placeholder} className="cs-cell-field" />;
}

const ioShow = (io: IoPattern | null) => formatIo(io);
const intShow = (n: number) => String(n);

const arrivalParse = (s: string) => parseBoundedInt(s, { min: 0, max: MAX_ARRIVAL, messages: { empty: 'type an arrival time.', invalid: () => `arrival is a whole number from 0 to ${MAX_ARRIVAL}.`, tooSmall: () => 'arrival can\'t be negative.', tooBig: () => `keep arrival at ${MAX_ARRIVAL} or less.` } });
const burstParse = (s: string) => parseBoundedInt(s, { min: 1, max: MAX_BURST, messages: { empty: 'type a burst length.', invalid: () => `burst is a whole number from 1 to ${MAX_BURST}.`, tooSmall: () => 'a job needs at least 1 tick of CPU.', tooBig: () => `keep bursts at ${MAX_BURST} ticks or less.` } });

/**
 * The job table: editable arrival, burst and I/O, plus each job's numbers at the current
 * moment (completion, turnaround and response once known; waiting so far, live).
 */
export function JobTable({ rows, onChange, onAdd, onRemove, s, moment }: {
  rows: readonly JobRow[];
  onChange: (key: number, job: Job) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
  s: Schedule;
  moment: Moment;
}) {
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  /** After a removal, the row index whose remove button should take focus (or Add, if none are left). */
  const focusRow = useRef<number | null>(null);
  const t = moment.t;
  const finished = moment.cpu === null;
  const known = (x: number, at: number) => (at <= t ? x : NA);

  useEffect(() => {
    const row = focusRow.current;
    if (row === null) return;
    focusRow.current = null;
    const removes = wrap.current?.querySelectorAll<HTMLButtonElement>('.cs-remove');
    const target = removes && removes.length > 0 ? removes[Math.min(row, removes.length - 1)] : wrap.current?.querySelector<HTMLButtonElement>('.cs-add');
    target?.focus();
  });

  const remove = (i: number) => {
    focusRow.current = i;
    onRemove(rows[i].key);
  };

  const avg = (pick: (i: number) => number) => (finished ? average(rows.map((_, i) => pick(i))).toFixed(2) : NA);

  return (
    <div className="cs-jobs" ref={wrap}>
      <WideRegion minWidth={620} label="Job table: scroll sideways to see all of it" hint="swipe to see the whole table">
        <table className="data-table cs-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Arrival</th>
              <th>Burst</th>
              <th title="cpu/io: ticks of CPU, then ticks of I/O, repeated">I/O</th>
              <th>Done at</th>
              <th>Turnaround</th>
              <th>Waiting</th>
              <th>Response</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, job }, i) => {
              const st = s.stats[i];
              const starving = moment.streak[i] >= STARVE_TICKS;
              const set = (patch: Partial<Job>) => onChange(key, { ...job, ...patch });
              return (
                <tr key={key}>
                  <td>
                    <span className={`cs-swatch tone-${jobTone(i)}`} aria-hidden="true" />
                    {job.name}
                  </td>
                  <td>
                    <EditCell value={job.arrival} show={intShow} label={`${job.name} arrival`} parse={arrivalParse} onCommit={(arrival) => set({ arrival })} onError={setError} />
                  </td>
                  <td>
                    <EditCell value={job.burst} show={intShow} label={`${job.name} burst`} parse={burstParse} onCommit={(burst) => set({ burst })} onError={setError} />
                  </td>
                  <td>
                    <EditCell value={job.io} show={ioShow} label={`${job.name} I/O`} placeholder="none" parse={parseIo} onCommit={(io) => set({ io })} onError={setError} />
                  </td>
                  <td>{known(st.completion, st.completion)}</td>
                  <td>{known(st.turnaround, st.completion)}</td>
                  <td className={starving ? 'cs-starving' : ''}>
                    {st.completion <= t ? st.waiting : moment.waited[i]}
                    {starving && <span className="cs-starve-tag"> starving</span>}
                  </td>
                  <td>{known(st.response, st.firstRun)}</td>
                  <td>
                    {rows.length > 1 && (
                      <ChipButton tone="bad" ariaLabel={`Remove ${job.name}`} className="cs-remove" onClick={() => remove(i)}>
                        ×
                      </ChipButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>{finished ? 'Average' : 'Average (when all are done)'}</td>
              <td>{avg((i) => s.stats[i].turnaround)}</td>
              <td>{avg((i) => s.stats[i].waiting)}</td>
              <td>{avg((i) => s.stats[i].response)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </WideRegion>
      <div className="cs-table-foot">
        <Button className="cs-add" onClick={onAdd} disabled={rows.length >= MAX_JOBS} aria-describedby={rows.length >= MAX_JOBS ? 'cs-max-note' : undefined}>
          + Add job
        </Button>
        {rows.length >= MAX_JOBS && (
          <span className="hint" id="cs-max-note">
            {MAX_JOBS} jobs is the most this demo draws.
          </span>
        )}
        <span className="hint">I/O as cpu/io: 1/3 runs 1 tick, then waits 3 ticks on I/O, repeated. Empty means none.</span>
      </div>
      <p className="cs-error" role="status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
