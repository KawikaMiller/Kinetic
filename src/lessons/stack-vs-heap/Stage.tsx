import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { HeapObject, RefArrow, VarSlot, heapRect, slotPort, slotValueRect } from '../../components/memory';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { SHAKE } from '../../core/motion';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { PRESETS, type ShFrame } from './frames';
import { BLOCK_W, FRAME_W, SCENE_H, SCENE_W, STACK_LIMIT_Y, heapSpot, layoutStack, slotAt, type FrameBox } from './layout';
import { collectable, ghostFrames, isDangling, leaked, liveFrames, topFrame, type Mode, type Value, type World } from './model';
import './styles.css';

/** Narrowest stage where the scene's smallest text still renders at 8px or more. */
const MIN_WIDTH = 880;

const MODES: { value: Mode; label: string }[] = [
  { value: 'managed', label: 'JavaScript (managed)' },
  { value: 'manual', label: 'C (manual)' },
];

export function Stage() {
  const [mode, setMode] = useState<Mode>('managed');
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const frames = useMemo(() => preset.build(), [preset]);
  const player = usePlayer(frames, { interval: 1700 });
  const f = player.frame;
  const { world } = f;

  const pickMode = (m: Mode) => {
    setMode(m);
    setPresetId(PRESETS.find((p) => p.mode === m)!.id);
  };

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      player={player}
      height={520}
      stats={<MemoryStats world={world} />}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running frame / line' },
            { color: 'var(--info)', label: 'live heap block' },
            { color: 'var(--violet)', label: 'reference', shape: 'line' },
            { color: 'var(--bad)', label: 'dangling · freed · leaked' },
            { color: 'var(--dim)', label: 'collectable' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Memory" value={mode} onChange={pickMode} options={MODES} />
          <Segmented
            label="Program"
            value={presetId}
            onChange={setPresetId}
            options={PRESETS.filter((p) => p.mode === mode).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Controls>
      }
    >
      <div className="sh">
        <div className="sh-side">
          <CodePanel title={preset.language} lines={preset.code} active={f.line} />
          {world.error && <p className="sh-error">{world.error}</p>}
          <Hint block>Simplified: real runtimes may keep small values in registers, and escape analysis can put some objects on the stack.</Hint>
        </div>
        <Scene frame={f} showLimit={!!preset.showsStackLimit} />
      </div>
    </StageFrame>
  );
}

function MemoryStats({ world }: { world: World }) {
  const liveBlocks = world.heap.filter((b) => !b.freed).length;
  return (
    <Stats>
      <Stat label="Stack frames" value={liveFrames(world).length} color={world.crashed ? 'var(--bad)' : 'var(--hi)'} />
      <Stat label="Heap blocks" value={liveBlocks} color="var(--info)" />
      {world.mode === 'manual' ? (
        <Stat label="Leaked" value={leaked(world).size} color={leaked(world).size ? 'var(--bad)' : undefined} sub="never freed, unreachable" />
      ) : (
        <Stat label="Collectable" value={collectable(world).size} sub="unreachable, awaiting GC" />
      )}
    </Stats>
  );
}

const slotText = (v: Value, mode: Mode) =>
  v.kind === 'prim' ? v.text : v.kind === 'null' ? 'NULL' : v.kind === 'unset' ? (mode === 'manual' ? '?' : '…') : undefined;

function Scene({ frame, showLimit }: { frame: ShFrame; showLimit: boolean }) {
  const { world } = frame;
  const ghosts = ghostFrames(world);
  const boxes = layoutStack(world.stack.filter((s) => !s.popped || ghosts.has(s.id)));
  // The crash shake is error feedback, not teaching motion: hold still under reduced motion.
  const reduceMotion = useReducedMotion();
  const top = topFrame(world);
  const gc = collectable(world);
  const lost = leaked(world);
  const boxOf = (id: string) => boxes.find((b) => b.frame.id === id);
  const blockAt = (id: string) => heapSpot(world.heap.findIndex((b) => b.id === id));

  return (
    <svg className="sh-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label="The call stack on the left, the heap on the right">
      <text className="scene-zone" x={16} y={24}>stack</text>
      <text className="scene-zone" x={318} y={24}>heap (no particular order)</text>
      {showLimit && (
        <g className="sh-limit">
          <line x1={10} x2={FRAME_W + 22} y1={STACK_LIMIT_Y} y2={STACK_LIMIT_Y} />
          <text x={FRAME_W + 26} y={STACK_LIMIT_Y + 4}>stack limit</text>
        </g>
      )}

      <motion.g animate={world.crashed && !reduceMotion ? SHAKE : { x: 0 }}>
        {boxes.map((box) => (
          <FrameView key={box.frame.id} box={box} running={box.frame.id === top?.id && !world.crashed} crashed={world.crashed} world={world} />
        ))}
      </motion.g>

      {world.heap.map((b) => {
        const isLeak = lost.has(b.id);
        return (
          <HeapObject
            key={b.id}
            at={blockAt(b.id)}
            w={BLOCK_W}
            title={b.label}
            fields={b.fields.map((x) => ({ name: x.name, value: x.text }))}
            variant={b.freed ? 'freed' : gc.has(b.id) ? 'collectable' : 'live'}
            tone={isLeak ? 'bad' : 'info'}
            tag={isLeak ? 'leaked' : undefined}
          />
        );
      })}

      {boxes.flatMap((box) =>
        box.frame.popped
          ? []
          : box.frame.slots.map((slot, i) => {
              if (slot.value.kind !== 'ptr') return null;
              const from = slotPort(slotAt(box, i));
              const dangling = isDangling(world, box.frame.id, slot.name);
              const to = slot.value.to;
              if (to.kind === 'heap') {
                const block = world.heap.find((x) => x.id === to.block)!;
                return <RefArrow key={`${box.frame.id}.${slot.name}`} from={from} to={heapRect(blockAt(to.block), BLOCK_W, block.fields.length)} dangling={dangling} />;
              }
              const target = boxOf(to.frame);
              if (!target) return null;
              const index = target.frame.slots.findIndex((s) => s.name === to.slot);
              return <RefArrow key={`${box.frame.id}.${slot.name}`} from={from} to={slotValueRect(slotAt(target, index))} dangling={dangling} bend={-40} />;
            }),
      )}
    </svg>
  );
}

function FrameView({ box, running, crashed, world }: { box: FrameBox; running: boolean; crashed: boolean; world: World }) {
  const { frame } = box;
  const cls = frame.popped ? 'is-ghost' : running ? 'is-running' : crashed ? 'is-crashed' : '';
  return (
    <g className={`sh-frame ${cls}`}>
      <rect className="sh-frame-box" x={box.x} y={box.y} width={FRAME_W} height={box.h} rx={10} />
      <text className="sh-frame-title" x={box.x + 10} y={box.y + 15}>
        {frame.popped ? `${frame.fn} · returned` : frame.fn}
      </text>
      {frame.slots.map((slot, i) => {
        const tone: Tone = !frame.popped && isDangling(world, frame.id, slot.name) ? 'bad' : slot.value.kind === 'ptr' ? 'violet' : 'info';
        return (
          <VarSlot
            key={slot.name}
            at={slotAt(box, i)}
            name={slot.name}
            isRef={slot.value.kind === 'ptr'}
            value={slotText(slot.value, world.mode)}
            tone={tone}
            highlight={tone === 'bad'}
            dead={frame.popped}
          />
        );
      })}
    </g>
  );
}
