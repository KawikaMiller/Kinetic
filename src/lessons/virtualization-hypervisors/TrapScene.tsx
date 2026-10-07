import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Packet } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { trapFrames } from './frames';
import { handle, STREAM, TECHNIQUES, tally, type Handling, type Technique } from './model';

const STEP_MS = 1500;
const W = 380;
const H = 300;
const LAYER = { app: 14, kernel: 72, hyper: 162, cpu: 232 } as const;
const LAYER_H = 50;
const KERNEL_H = 74;
const PILL = { x: 190, y: LAYER.kernel + 46 };

const TAG: Record<Handling, string> = { direct: 'direct', trap: 'trap', translate: 'rewritten', hypercall: 'hypercall', bad: 'wrong!' };

function kernelLabel(t: Technique) {
  if (t === 'hw') return 'guest kernel · ring 0, guest mode';
  if (t === 'pv') return 'guest kernel (modified) · ring 1';
  return 'guest kernel · deprivileged to ring 1';
}

export function TrapScene({ picker }: { picker: ReactNode }) {
  const [technique, setTechnique] = useState<Technique>('classic');
  const frames = useMemo(() => trapFrames(technique), [technique]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { i } = player.frame;
  // Instructions run so far, the current one included: none on the intro, all on the summary.
  const upto = i >= 0 ? i + 1 : player.index === 0 ? 0 : STREAM.length;
  const instr = i >= 0 ? STREAM[i] : null;
  const h = instr ? handle(instr, technique) : null;
  const sofar = tally(STREAM.slice(0, upto), technique);
  const caught = h === 'trap' || h === 'hypercall';

  return (
    <StageFrame
      player={player}
      height={400}
      stats={
        <Stats>
          <Stat label="Ran directly" value={sofar.direct} color="var(--ok)" />
          <Stat label="Hypervisor handled" value={sofar.caught} color="var(--violet)" />
          <Stat label="Silently wrong" value={sofar.bad} color={sofar.bad ? 'var(--bad)' : undefined} />
          <Stat label="Cycles" value={sofar.cycles.toLocaleString('en-US')} sub="illustrative" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'instruction running now' },
            { color: 'var(--ok)', label: 'ran directly' },
            { color: 'var(--violet)', label: 'trap / VM exit, hypercall, rewrite' },
            { color: 'var(--info)', label: 'hypervisor' },
            { color: 'var(--bad)', label: 'sensitive, never caught' },
          ]}
        />
      }
      controls={[picker, <Segmented key="t" label="Technique" value={technique} onChange={setTechnique} options={TECHNIQUES} />]}
    >
      <div className="vh stage-pad">
        <div className="vh-trap">
          <CodePanel
            title="guest kernel code"
            lines={STREAM.map((x) => x.text)}
            stateOf={(k) => (k === i ? 'now' : k < upto ? (handle(STREAM[k], technique) === 'bad' ? 'bad' : 'past') : 'idle')}
            trailing={(k) => (k < upto ? <span className={`vh-tag is-${handle(STREAM[k], technique)}`}>{TAG[handle(STREAM[k], technique)]}</span> : null)}
          />
          <svg viewBox={`0 0 ${W} ${H}`} className="vh-layers" role="img" aria-label={instr ? `${instr.text}: ${TAG[h!]}` : 'Guest and hypervisor layers'}>
            <rect x={10} y={LAYER.app} width={W - 20} height={LAYER_H} rx={10} className="vh-layer is-app" />
            <text x={22} y={LAYER.app + 30} className="vh-layer-text">guest apps · ring 3</text>
            <rect x={10} y={LAYER.kernel} width={W - 20} height={KERNEL_H} rx={10} className="vh-layer is-kernel" />
            <text x={22} y={LAYER.kernel + 20} className="vh-layer-text">{kernelLabel(technique)}</text>
            <rect x={10} y={LAYER.hyper} width={W - 20} height={LAYER_H} rx={10} className={`vh-layer is-hyper ${caught ? 'is-busy' : ''}`} />
            <text x={22} y={LAYER.hyper + 30} className="vh-layer-text">hypervisor{technique === 'hw' ? ' · VMX root mode' : ' · ring 0'}</text>
            <rect x={10} y={LAYER.cpu} width={W - 20} height={LAYER_H} rx={10} className={`vh-layer is-cpu ${h === 'direct' ? 'is-direct' : ''}`} />
            <text x={22} y={LAYER.cpu + 30} className="vh-layer-text">physical CPU</text>
            {instr && (
              <g className={`vh-pill is-${h}`}>
                <rect x={PILL.x - 70} y={PILL.y - 9} width={140} height={22} rx={11} />
                <text x={PILL.x} y={PILL.y + 6}>
                  {h === 'translate' ? `call vmm_${instr.id}` : instr.text}
                </text>
              </g>
            )}
            {instr && caught && (
              <Packet
                key={`${technique}-${i}`}
                path={[
                  { x: PILL.x + 110, y: PILL.y + 2 },
                  { x: PILL.x + 110, y: LAYER.hyper + 26 },
                  { x: PILL.x + 110, y: PILL.y + 2 },
                ]}
                label={h === 'trap' ? (technique === 'hw' ? 'VM exit → entry' : 'trap → resume') : 'hypercall'}
                color="var(--violet)"
                duration={1.3}
              />
            )}
            {instr && h === 'bad' && (
              <text x={PILL.x} y={LAYER.hyper + 30} className="vh-miss">
                ✗ never reaches the hypervisor
              </text>
            )}
          </svg>
        </div>
        <Hint block>Simplified instruction stream. Real VM exits cost hundreds to thousands of cycles; the cycle counts here are illustrative.</Hint>
      </div>
    </StageFrame>
  );
}
