import { BitStrip } from '../../components/BitStrip';
import { Box, SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { toBits } from '../../core/bits';
import type { VmFrame } from './frames';
import { hex3, hex4 } from './frames';
import { LAYOUT, OFFSET_BITS, VPN_BITS, type Proc } from './model';

const WIDTH = VPN_BITS + OFFSET_BITS;
const GAP = { from: LAYOUT.indexOf(null), to: LAYOUT.lastIndexOf(null) };

/** The address split on a BitStrip, then the process's page table with the row being used lit. */
export function TranslatePanel({ f, proc }: { f: VmFrame; proc: Proc }) {
  const a = f.access;
  const shownProc = a?.proc ?? proc;
  const vaddr = a?.vaddr ?? null;
  const vpn = vaddr === null ? null : vaddr >>> OFFSET_BITS;
  const table = f.m.tables[shownProc];
  const done = f.step?.kind === 'done';
  const segv = f.step?.kind === 'segv';
  return (
    <div className="vm-panel">
      <Box className="vm-split" role="group" aria-label="Address split">
        <SectionTitle>{vaddr === null ? 'Virtual address' : `Virtual address ${hex4(vaddr)}`}</SectionTitle>
        <BitStrip
          bits={toBits(vaddr ?? 0, WIDTH)}
          size="sm"
          groups={[
            { from: 0, to: VPN_BITS - 1, tone: 'violet', label: vpn === null ? 'VPN' : `VPN ${vpn}` },
            { from: VPN_BITS, to: WIDTH - 1, tone: 'info', label: vaddr === null ? 'offset' : `offset ${hex3(vaddr & 0xfff)}` },
          ]}
          toneOf={(i) => (vaddr === null ? 'dim' : i < VPN_BITS ? 'violet' : 'info')}
        />
        <p className={`vm-result ${done ? 'is-ok' : segv ? 'is-bad' : ''}`}>
          {done && f.step?.paddr !== undefined ? (
            <>
              frame {f.step.frame} × 4096 + {hex3(vaddr! & 0xfff)} = <b>{hex4(f.step.paddr)}</b>
            </>
          ) : segv ? (
            <>segmentation fault</>
          ) : vaddr === null ? (
            <>pick an address</>
          ) : (
            <>translating…</>
          )}
        </p>
      </Box>
      <Box className="vm-table-box" role="group" aria-label={`Process ${shownProc}'s page table`}>
        <SectionTitle>{`${shownProc}'s page table`}</SectionTitle>
        <WideRegion minWidth={300} label="Page table: scroll sideways to see all of it" hint="swipe to see the whole table">
          <table className="data-table vm-table">
            <thead>
              <tr>
                <th>VPN</th>
                <th>Page</th>
                <th title="present">P</th>
                <th>Frame</th>
                <th title="writable">W</th>
                <th title="dirty">D</th>
              </tr>
            </thead>
            <tbody>
              {table.map((p) => {
                if (!p.kind) {
                  // The unmapped gap is one row: it lights when the address falls anywhere in it.
                  if (p.vpn !== GAP.from) return null;
                  const inGap = vpn !== null && vpn >= GAP.from && vpn <= GAP.to;
                  return (
                    <tr key="gap" className={`is-unmapped ${inGap ? 'is-current' : ''}`}>
                      <td>
                        {GAP.from}–{GAP.to}
                      </td>
                      <td colSpan={5}>not mapped (the gap)</td>
                    </tr>
                  );
                }
                return (
                  <tr key={p.vpn} className={p.vpn === vpn ? 'is-current' : ''}>
                    <td>{p.vpn}</td>
                    <td>{p.kind}</td>
                    <td>{p.present ? 1 : 0}</td>
                    <td>{p.present ? p.frame : '–'}</td>
                    <td>{p.writable ? 1 : 0}</td>
                    <td className={p.dirty ? 'vm-dirty' : ''}>{p.dirty ? 1 : 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
      </Box>
    </div>
  );
}
