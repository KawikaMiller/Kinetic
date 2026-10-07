import { useMemo, useState, type ReactNode } from 'react';
import { CallStackPanel } from '../../components/CallStackPanel';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { MemoryMap, memPort, RefArrow } from '../../components/memory';
import { Box, SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { callFrames, clobbered } from './frames';
import { ABI, alignLabel, HONESTY, STACK_TOP, type RunResult, type SceneId, type SceneOptions } from './model';
import { stackPicture, whyNoFrame } from './stackLayout';
import { unwind, walkFramePointers } from './unwind';
import { hex, signed, type Reg64 } from './x86';
import './styles.css';

const STEP_MS = 1500;
const SHOWN: Reg64[] = ['rdi', 'rsi', 'rdx', 'rcx', 'r8', 'r9', 'rax', 'rbx', 'rbp', 'rsp'];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({
    label: 'Scene',
    options: [
      { value: 'calls', label: 'main → area → mul' },
      { value: 'seven', label: '7 arguments' },
      { value: 'saved', label: 'Caller- vs callee-saved' },
      { value: 'deep', label: 'Deep recursion' },
    ],
    initial: 'calls',
  });
  return <SceneView key={scene} scene={scene} picker={picker} />;
}

function SceneView({ scene, picker }: { scene: SceneId; picker: ReactNode }) {
  const [o, setO] = useState<SceneOptions>({ framePointers: true, callerSavesRcx: false });
  const [trace, setTrace] = useState(false);
  const { run, frames } = useMemo(() => callFrames(scene, o), [scene, o]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const k = player.frame.k;
  const s = run.steps[k];
  const e = s.effect;
  const pic = stackPicture(run, k);
  const { listing, program } = run;
  const asmLines = listing.asm.map((l) => (l.label !== undefined ? `${l.label}:` : `    ${l.asm}`));
  const nowLine = e ? program.lineOf.indexOf(program.instrs.indexOf(e.instr)) : -1;
  const nowC = nowLine >= 0 ? (listing.asm[nowLine].cLine ?? 0) - 1 : -1;
  const rsp = Number(s.cpu.regs.rsp);
  const lost = new Set(clobbered(run, k));

  const options =
    scene === 'calls' ? (
      <Toggle label="Frame pointers" value={o.framePointers} onChange={(v) => setO({ ...o, framePointers: v })} off="Omitted (-O1)" on="Kept (-fno-omit-frame-pointer)" />
    ) : scene === 'saved' ? (
      <Toggle label="main saves rcx" value={o.callerSavesRcx} onChange={(v) => setO({ ...o, callerSavesRcx: v })} off="No" on="Yes, push rcx" />
    ) : null;

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Frames" value={s.calls.length} sub={s.calls.map((c) => c.fn).join(' → ')} />
          <Stat label="Stack used" value={`${STACK_TOP - rsp} bytes`} />
          <Stat label="rsp mod 16" value={rsp % 16} sub={alignLabel(rsp)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'instruction just run', shape: 'square' },
            { color: 'var(--info)', label: 'argument registers', shape: 'square' },
            { color: 'var(--violet)', label: 'return address, saved-rbp chain', shape: 'square' },
            { color: 'var(--ok)', label: 'return value', shape: 'square' },
            { color: 'var(--orange)', label: 'clobbered by the call', shape: 'square' },
            { color: 'var(--bad)', label: 'guard page, overflow', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          {options}
          <ChipButton tone="violet" size="md" on={trace} onClick={() => setTrace(!trace)}>
            Backtrace
          </ChipButton>
        </>,
      ]}
    >
      <div className="cv stage-pad">
        <CodePanel
          title={`x86-64 · ${listing.flags}`}
          lines={asmLines}
          active={nowLine >= 0 ? nowLine : null}
          trailing={(i) => listing.asm[i].note ?? ''}
        />
        <div className="cv-panels">
          <div className="cv-stack">
            <SectionTitle>stack · high addresses on top, growing down</SectionTitle>
            <MemoryMap
              regions={pic.regions}
              cells={pic.cells}
              pointers={pic.pointers}
              highlight={pic.highlight}
              direction="down"
              ariaLabel={`Stack memory, rsp ${hex(rsp)}`}
              overlay={(L) =>
                pic.chain.map((c) => {
                  const from = memPort(L, c.from, 'right');
                  const to = memPort(L, c.to, 'right');
                  return from && to ? <RefArrow key={c.from} from={from} to={to} tone="violet" bend={-26} thin /> : null;
                })
              }
            />
          </div>
          <div className="cv-side">
            <CallStackPanel
              frames={[...s.calls].reverse().map((c, i) => ({
                id: c.id,
                name: `${c.fn}(${c.args.map((a) => signed(a).toString()).join(', ')})`,
                state: i === 0 ? (s.overflow ? 'error' : 'running') : 'waiting',
              }))}
              meta={`${s.calls.length} frames`}
              alarm={s.overflow}
            />
            <Box className="cv-regs" role="group" aria-label="Registers">
              <SectionTitle>registers</SectionTitle>
              <div className="cv-reg-grid">
                {SHOWN.map((r) => {
                  const cls = lost.has(r) ? 'is-clobbered' : r === 'rax' && e?.instr.op === 'ret' ? 'is-result' : e?.wroteRegs.includes(r) ? 'is-changed' : ABI.argRegs.includes(r) ? 'is-arg' : '';
                  const v = s.cpu.regs[r];
                  return (
                    <div key={r} className={`cv-reg ${cls}`}>
                      <span className="cv-reg-name">{r}</span>
                      <span className="cv-reg-value">{r === 'rsp' || r === 'rbp' ? hex(v) : signed(v).toString()}</span>
                    </div>
                  );
                })}
              </div>
            </Box>
            {trace && <Backtrace run={run} k={k} />}
            {listing.c && (
              <CodePanel title="C source" lines={listing.c} active={nowC >= 0 ? nowC : null} />
            )}
          </div>
        </div>
        <Hint block>{HONESTY}</Hint>
      </div>
    </StageFrame>
  );
}

function Backtrace({ run, k }: { run: RunResult; k: number }) {
  const s = run.steps[k];
  if (s.cpu.halted && !s.overflow) return <ConsolePanel title="backtrace" lines={['(main has returned: nothing on the stack)']} />;
  const real = unwind(s.cpu, run.rules, run.fns).frames.join(' ← ');
  const fp = walkFramePointers(s.cpu, run.fns).frames.join(' ← ');
  const usesFp = run.listing.id !== 'calls-nofp';
  const lines = usesFp
    ? [real, ...(fp !== real ? [{ text: `following rbp alone gives ${fp}: rbp isn't this function's frame right now (${whyNoFrame(run, s.cpu.rip)}), so its caller is skipped`, tone: 'orange' as const }] : [])]
    : [real, { text: `no frame pointers in this build (rbp = ${hex(s.cpu.regs.rbp)}): this came from unwind rules worked out from the listing (what gcc's .eh_frame would record for this code), not an rbp chain`, tone: 'orange' as const }];
  return <ConsolePanel title="backtrace (newest first)" lines={lines} />;
}
