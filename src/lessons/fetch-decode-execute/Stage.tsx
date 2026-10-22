import { useMemo, useState, type KeyboardEvent } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { CodePanel } from '../../components/CodePanel';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { pad2 } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { cpuFrames, type CpuFrame } from './frames';
import { ALU_PATH, CELL, SCENE, UNITS, cellAt, type UnitId } from './layout';
import { MEM_SIZE, PROGRAMS, assemble, disassemble, fields, usesAddr, usesReg, type Program } from './model';
import './styles.css';

const STEP_MS = 1150;
const MIN_WIDTH = 680;

export function Stage() {
  const [program, setProgram] = useState<Program>(PROGRAMS[0]);
  const [mem, setMem] = useState<number[]>(PROGRAMS[0].mem);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => cpuFrames(mem), [mem]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const current = f.effect?.at ?? null;

  const load = (p: Program) => {
    setProgram(p);
    setMem(p.mem);
    setEditing(null);
    setError(null);
  };

  const pickCell = (addr: number) => {
    setEditing(addr);
    setDraft(String(mem[addr]));
    setError(null);
  };

  const applyEdit = () => {
    if (editing === null) return;
    const word = assemble(draft);
    if (word === null) {
      setError('Type a number 0-255, or an instruction like LOAD R1, [14] or JMP 2.');
      return;
    }
    const next = [...mem];
    next[editing] = word;
    player.queueNext({ play: true });
    setMem(next);
    setError(null);
  };

  const listing = Array.from({ length: program.codeCells }, (_, i) => `${pad2(i)}  ${disassemble(f.cpu.mem[i]).padEnd(15)}; ${f.cpu.mem[i]}`);

  return (
    <StageFrame
      player={player}
      height={380}
      minWidth={MIN_WIDTH}
      stats={
        <Stats>
          <Stat label="Phase" value={f.phase === 'start' ? 'ready' : f.phase} color="var(--hi)" />
          <Stat label="Instructions run" value={f.done} />
          <Stat label="Cell 13" value={f.cpu.mem[13]} color="var(--ok)" sub="the answer cell" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'active data path' },
            { color: 'var(--info)', label: 'current instruction' },
            { color: 'var(--ok)', label: 'value just written' },
            { color: 'var(--dim)', label: 'idle' },
          ]}
        />
      }
      controls={[
        <ControlGroup key="programs" label="Program">
          {PROGRAMS.map((p) => (
            <ChipButton key={p.id} size="md" on={program.id === p.id} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
        <>
          {editing === null ? (
            <Hint>{program.intro} Click any memory cell to change it.</Hint>
          ) : (
            <>
              <TextField label={`Cell ${editing}`} value={draft} onChange={setDraft} onEnter={applyEdit} width={170} spellCheck={false} />
              <Button variant="primary" onClick={applyEdit}>Write & rerun</Button>
              <Button onClick={() => setEditing(null)}>Done</Button>
              {error && <Hint tone="bad">{error}</Hint>}
            </>
          )}
          <Button onClick={() => load(program)}>Reset memory</Button>
        </>,
      ]}
    >
      <div className="stage-pad fde">
        <CpuScene frame={f} current={current} editing={editing} onPickCell={pickCell} />
        <div className="fde-side">
          <CodePanel title="The program, disassembled" lines={listing} active={current !== null && current < program.codeCells ? current : null} nowStyle="bar" />
          <p className="fde-note">
            Toy instruction set, invented for this lesson; real CPUs have hundreds of instructions and pipeline them (Tier 2).
          </p>
        </div>
      </div>
    </StageFrame>
  );
}

function CpuScene({ frame, current, editing, onPickCell }: { frame: CpuFrame; current: number | null; editing: number | null; onPickCell: (a: number) => void }) {
  const hot = useArrowMarker('var(--hi)', { size: 6, refX: 9 });
  const { cpu, phase, effect } = frame;
  const state = (u: UnitId) => (frame.wrote.includes(u) ? 'ok' : frame.active.includes(u) ? 'hi' : null);
  const node = (u: UnitId, title: string, sub: string) => {
    const s = state(u);
    const { at, w, h } = UNITS[u];
    return <SceneNode at={at} w={w} h={h} rx={10} title={title} sub={sub} on={s !== null} tone={s ?? 'info'} variant={s ? 'default' : 'dim'} />;
  };
  const ir = fields(cpu.ir);
  const decoding = phase === 'decode' && effect;
  const op = effect?.instr.op;

  return (
    <svg viewBox={`0 0 ${SCENE.width} ${SCENE.height}`} className="fde-svg" role="img" aria-label="Toy CPU and memory">
      <defs>{hot.def}</defs>
      {frame.paths.map((p, i) => (
        <line key={`${phase}-${i}`} x1={p.from.x} y1={p.from.y} x2={p.to.x} y2={p.to.y} className={`fde-path is-${p.kind}`} markerEnd={hot.url} />
      ))}

      {node('pc', 'PC', `next: ${cpu.pc}`)}
      {node('ir', 'IR', cpu.ir || phase !== 'start' ? disassemble(cpu.ir) : 'empty')}
      <text x={UNITS.ir.at.x} y={UNITS.ir.at.y + 48} textAnchor="middle" className="fde-bits">
        <tspan className={decoding ? 'is-op' : ''}>{ir.opcode.toString(2).padStart(3, '0')}</tspan>{' '}
        <tspan className={decoding && op && usesReg(op) ? 'is-reg' : 'is-unused'}>{ir.reg}</tspan>{' '}
        <tspan className={decoding && op && usesAddr(op) ? 'is-addr' : 'is-unused'}>{ir.addr.toString(2).padStart(4, '0')}</tspan>
      </text>
      <text x={UNITS.ir.at.x} y={UNITS.ir.at.y + 64} textAnchor="middle" className="fde-bits-key">opcode · reg · address</text>
      {node('r0', 'R0', String(cpu.r[0]))}
      {node('r1', 'R1', String(cpu.r[1]))}
      <g transform={`translate(${UNITS.alu.at.x} ${UNITS.alu.at.y})`} className={`fde-alu ${state('alu') ? 'is-on' : ''}`}>
        <path d={ALU_PATH} />
        <text y={-6} textAnchor="middle" className="fde-alu-title">ALU</text>
        <text y={12} textAnchor="middle" className="fde-alu-sub">
          {phase === 'execute' && effect?.alu ? `${effect.alu.a} ${op === 'ADD' ? '+' : '−'} ${effect.alu.b} = ${effect.alu.result}` : 'add · subtract'}
        </text>
      </g>
      {node('z', 'Z flag', cpu.z ? '1 (last result was 0)' : '0')}

      {Array.from({ length: MEM_SIZE }, (_, addr) => {
        const c = cellAt(addr);
        const cls = [
          'fde-cell',
          addr === current && phase !== 'execute' && 'is-current',
          addr === frame.readCell && phase === 'execute' && 'is-read',
          addr === frame.wroteCell && 'is-wrote',
          addr === editing && 'is-editing',
        ].filter(Boolean).join(' ');
        const activate = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPickCell(addr);
          }
        };
        return (
          <g key={addr} className={cls} role="button" tabIndex={0} aria-label={`Memory cell ${addr}: ${cpu.mem[addr]}`} onClick={() => onPickCell(addr)} onKeyDown={activate}>
            <rect x={c.x - CELL / 2} y={c.y - CELL / 2} width={CELL} height={CELL} rx={8} />
            <text x={c.x - CELL / 2 + 6} y={c.y - CELL / 2 + 14} className="fde-addr">{addr}</text>
            <text x={c.x} y={c.y + 6} textAnchor="middle" className="fde-value">{cpu.mem[addr]}</text>
            <text x={c.x} y={c.y + CELL / 2 - 8} textAnchor="middle" className="fde-asm">{disassemble(cpu.mem[addr])}</text>
          </g>
        );
      })}
      <text x={cellAt(0).x - CELL / 2} y={SCENE.height - 4} className="fde-mem-label">memory: 16 cells, program and data alike</text>
    </svg>
  );
}
