import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { LogStream } from '../../components/LogStream';
import type { LogRow } from '../../components/logRows';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { plural } from '../../core/format';
import { seccompCaption } from './captions';
import { initialSeccomp } from './opening';
import { NEEDED, SYSCALLS, SYSCALL_NAMES, TRACE, checkMinimal, distinctGrants, grantedExtras, replay, type DefaultAction } from './seccomp';

const LOG_HEIGHT = 230;

const STATUS_TEXT = { allowed: 'allowed', denied: 'denied', 'not-run': 'not reached' } as const;
const STATUS_TONE = { allowed: 'ok', denied: 'bad', 'not-run': 'dim' } as const;

/** Scene 2: an allow-list of system call names, and a script of calls replayed against it. */
export function SeccompScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialSeccomp);
  const { allowed, otherwise } = state;
  const set = useMemo(() => new Set(allowed), [allowed]);
  const run = useMemo(() => replay(set, otherwise), [set, otherwise]);
  const check = checkMinimal(set);
  const extras = grantedExtras(set);
  const rows: LogRow[] = run.rows.map((r) => ({
    id: r.index,
    at: String(r.index + 1),
    tone: STATUS_TONE[r.status],
    level: STATUS_TEXT[r.status],
    text: `${r.name}()`,
  }));
  const filterLines = [
    'filter image-resizer {',
    ...SYSCALL_NAMES.filter((n) => set.has(n)).map((n) => `  allow ${n}`),
    `  otherwise: ${otherwise === 'kill' ? 'kill the process' : 'return an error'}`,
    '}',
  ];
  const toggle = (name: string, value: boolean) => setState((s) => ({ ...s, allowed: SYSCALL_NAMES.filter((n) => (n === name ? value : s.allowed.includes(n))) }));
  const endingText = run.ending === 'completed' ? 'ran to the end' : run.ending === 'killed' ? `killed at call ${run.firstDenied! + 1}` : `failed at call ${run.firstDenied! + 1}`;

  return (
    <StageFrame
      height={470}
      intro={seccompCaption(allowed, otherwise)}
      introKey={[allowed.join(','), otherwise]}
      stats={
        <Stats>
          <Stat label="The toy resizer" value={endingText} color={run.ending === 'completed' ? 'var(--ok)' : 'var(--bad)'} sub={`script of ${TRACE.length} calls`} />
          <Stat label="List" value={`${allowed.length} of ${SYSCALLS.length}`} color="var(--violet)" sub={check.minimal ? 'the smallest that still runs' : check.runs ? `${check.extra.length} more than the script needs` : `${plural(check.missing.length, 'needed call')} missing`} />
          <Stat label="Capabilities granted" value={distinctGrants(extras)} color={extras.length > 0 ? 'var(--orange)' : 'var(--muted)'} sub={`from ${extras.length} risky calls allowed that the script never makes`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'call allowed', shape: 'square' },
            { color: 'var(--bad)', label: 'call denied', shape: 'square' },
            { color: 'var(--dim)', label: 'not reached', shape: 'square' },
            { color: 'var(--orange)', label: 'a capability granted', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<DefaultAction> label="A call not on the list" value={otherwise} onChange={(v) => setState((s) => ({ ...s, otherwise: v }))} options={[{ value: 'kill', label: 'Kill the process' }, { value: 'errno', label: 'Return an error' }]} />
          <ControlGroup label="Lists">
            <ChipButton tone="info" onClick={() => setState((s) => ({ ...s, allowed: [] }))}>Nothing</ChipButton>
            <ChipButton tone="info" onClick={() => setState((s) => ({ ...s, allowed: [...SYSCALL_NAMES] }))}>Everything</ChipButton>
            <ChipButton tone="info" onClick={() => setState((s) => ({ ...s, allowed: [...initialSeccomp().allowed] }))}>Start again</ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="sb-stage stage-pad">
        <div className="sb-block">
          <SectionTitle>Allow-list: tick the calls the resizer may make</SectionTitle>
          <div className="sb-checks">
            {SYSCALLS.map((c) => (
              <label key={c.name} className={`sb-check ${c.grants ? 'is-risky' : ''}`}>
                <input type="checkbox" checked={set.has(c.name)} onChange={(e) => toggle(c.name, e.target.checked)} />
                <code>{c.name}</code>
              </label>
            ))}
          </div>
          {extras.length > 0 && (
            <ul className="sb-list">
              {extras.map((e) => (
                <li key={e.name}>
                  <code>{e.name}</code> is allowed, and the script never makes it: {e.grants}.
                </li>
              ))}
            </ul>
          )}
          <p className="sb-note">The script makes {NEEDED.length} different calls: {NEEDED.join(', ')}. The list is the smallest that works when it holds exactly those.</p>
        </div>
        <div className="sb-two">
          <div className="sb-block">
            <LogStream label="The resizer's calls replayed against the list" rows={rows} maxHeight={LOG_HEIGHT} live="off" />
          </div>
          <div className="sb-block">
            <CodePanel title="The filter as a readable stand-in" lines={filterLines} stateOf={(i) => (i === 0 || i === filterLines.length - 1 ? 'idle' : 'past')} />
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated">no system call is made: the strace-style output is the toy resizer's scripted trace</Provenance>
        <Provenance kind="from-memory">real filters are BPF programs with several actions (kill the process, return an error, trap, trace, log, allow); verify against seccomp(2)</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
