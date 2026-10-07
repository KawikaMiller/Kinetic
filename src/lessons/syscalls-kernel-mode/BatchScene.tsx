import type { ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Hint } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, latency } from '../../core/format';
import { BUFFER_SIZES, COPY_FILE_BYTES, copyCost, HONESTY, SYSCALL_NS } from './model';

const LOOP = ['while ((n = read(in, buf, BUF)) > 0)', '    write(out, buf, n);'];
const count = (n: number) => n.toLocaleString('en-US');
const sizeLabel = (b: number) => (b === 1 ? '1 byte' : bytes(b, { dp: 0 }));

/** Copying one file with buffers of different sizes: syscall counts and the crossing time, to scale. */
export function BatchScene({ picker }: { picker: ReactNode }) {
  const rows = BUFFER_SIZES.map((b) => ({ b, c: copyCost(COPY_FILE_BYTES, b) }));
  const max = Math.max(...rows.map((r) => r.c.crossingNs));
  const first = rows[0];
  const last = rows[rows.length - 1];
  useIntroCaption(
    <>
      Copying a {bytes(COPY_FILE_BYTES, { dp: 0 })} file {sizeLabel(first.b)} at a time takes {count(first.c.syscalls)} system calls; with a {sizeLabel(last.b)} buffer it takes {count(last.c.syscalls)}.
      Same bytes, same result: only the number of trips into the kernel changes.
    </>,
  );
  return (
    <StageFrame height={320} controls={[picker]}>
      <div className="sk stage-pad">
        <CodePanel title="the copy loop" lines={LOOP} />
        <WideRegion minWidth={560} label="Syscall counts: scroll sideways to see all of it" hint="swipe to see the whole table">
          <table className="data-table sk-batch">
            <thead>
              <tr>
                <th>Buffer</th>
                <th>read() calls</th>
                <th>write() calls</th>
                <th>Crossing time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, c }) => (
                <tr key={b}>
                  <td>{sizeLabel(b)}</td>
                  <td>
                    {count(c.reads)} <span className="sk-muted">({count(c.dataReads)} + 1 at end of file)</span>
                  </td>
                  <td>{count(c.writes)}</td>
                  <td className="sk-cost">
                    <span>{latency(c.crossingNs)}</span>
                    <Bar value={c.crossingNs} max={max} tone="hi" height={6} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <Hint block>
          Bars to scale: {latency(SYSCALL_NS)} per call just to cross in and out (illustrative), before any real work. {HONESTY}
        </Hint>
      </div>
    </StageFrame>
  );
}
