import { motion } from 'motion/react';
import { Packet, SceneNode } from '../../components/scene';
import type { Pt } from '../../core/geometry';
import { SPRING } from '../../core/motion';
import type { CallStep, NodeId } from './model';

/** Natural size of the wall scene. */
export const WALL_W = 640;
export const WALL_H = 300;
const NODE = { w: 136, h: 50 };
const BAND = { userTop: 10, kernelTop: 160, h: 130, x: 10, w: 520 };
const SWITCH = { x: 560, y: 40, w: 64, h: 220 };

const POS: Record<NodeId, Pt> = {
  app: { x: 100, y: 82 },
  libc: { x: 270, y: 82 },
  buf: { x: 440, y: 82 },
  entry: { x: 100, y: 232 },
  table: { x: 270, y: 232 },
  vfs: { x: 440, y: 232 },
};

const TITLES: Record<NodeId, [string, string]> = {
  app: ['your code', 'read(3, buf, 4096)'],
  libc: ['libc', 'read() wrapper'],
  buf: ['buf', '4096-byte buffer'],
  entry: ['kernel entry', 'entry_SYSCALL_64'],
  table: ['syscall table', '[0] → sys_read'],
  vfs: ['VFS + page cache', 'the file\'s data'],
};

/**
 * The user/kernel wall: two bands (user --info, kernel --violet), the six places a read()
 * passes through, the packet crossing between them, and the CPU's mode bit as a switch.
 * Local to this lesson (the plan keeps the two-band wall local: one user).
 */
export function Wall({ step, index, privileged }: { step: CallStep; index: number; privileged: boolean }) {
  const nodes: NodeId[] = privileged ? ['app', 'entry'] : ['app', 'libc', 'buf', 'entry', 'table', 'vfs'];
  const knobY = step.ring === 3 ? SWITCH.y + 16 : SWITCH.y + SWITCH.h - 16 - 60;
  const sub = (id: NodeId) => (privileged && id === 'app' ? (step.killed ? 'killed: SIGSEGV' : 'hlt') : privileged && id === 'entry' ? 'fault handler' : TITLES[id][1]);
  return (
    <svg className="sk-wall" viewBox={`0 0 ${WALL_W} ${WALL_H}`} role="img" aria-label={`User space above, the kernel below; the CPU is in ring ${step.ring}`}>
      <rect className="sk-band is-user" x={BAND.x} y={BAND.userTop} width={BAND.w} height={BAND.h} rx={12} />
      <rect className="sk-band is-kernel" x={BAND.x} y={BAND.kernelTop} width={BAND.w} height={BAND.h} rx={12} />
      <text className="sk-band-label is-user" x={BAND.x + 12} y={BAND.userTop + 20}>
        user space · ring 3
      </text>
      <text className="sk-band-label is-kernel" x={BAND.x + 12} y={BAND.kernelTop + BAND.h - 10}>
        kernel · ring 0
      </text>
      {nodes.map((id) => (
        <SceneNode
          key={id}
          at={POS[id]}
          w={NODE.w}
          h={NODE.h}
          title={TITLES[id][0]}
          sub={sub(id)}
          on={step.at === id && !step.killed}
          tone="hi"
          variant={privileged && id === 'app' && step.killed ? 'bad' : 'default'}
        />
      ))}
      {step.move && (
        <Packet
          key={index}
          path={[POS[step.move.from], POS[step.move.to]]}
          label={step.move.label}
          color={step.move.fault ? 'var(--bad)' : 'var(--info)'}
          arrive="fade"
          duration={1.1}
        />
      )}
      <g className="sk-switch" aria-hidden="true">
        <text className="sk-switch-title" x={SWITCH.x + SWITCH.w / 2} y={SWITCH.y - 14}>
          mode bit
        </text>
        <rect className="sk-switch-track" x={SWITCH.x} y={SWITCH.y} width={SWITCH.w} height={SWITCH.h} rx={14} />
        <motion.rect
          className={`sk-switch-knob ${step.ring === 3 ? 'is-user' : 'is-kernel'}`}
          x={SWITCH.x + 6}
          width={SWITCH.w - 12}
          height={60}
          rx={10}
          initial={false}
          animate={{ y: knobY }}
          transition={SPRING.snappy}
        />
        <motion.text className="sk-switch-text" x={SWITCH.x + SWITCH.w / 2} initial={false} animate={{ y: knobY + 36 }} transition={SPRING.snappy}>
          ring {step.ring}
        </motion.text>
      </g>
    </svg>
  );
}
