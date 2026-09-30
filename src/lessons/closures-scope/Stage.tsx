import { useMemo, useState } from 'react';
import { useArrowMarker } from '../../components/ArrowMarker';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { HeapObject, RefArrow, heapFieldPort, rectCenter, rectEdgeToward, type Rect } from '../../components/memory';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Hint, Legend, Segmented } from '../../components/ui';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { PRESETS, type ClFrame } from './frames';
import { BOX_W, SCENE_W, TIMER_PLACE, boxRect, placeAt, sceneHeight } from './layout';
import { capturedEnvs, reachable } from './model';
import './styles.css';

/** Narrowest stage where the scene's smallest text still renders at 8px or more. */
const MIN_WIDTH = 900;

export function Stage() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const frames = useMemo(() => preset.build(), [preset]);
  const height = useMemo(() => {
    const rows = frames.flatMap((f) => [...f.world.envs.map((e) => e.place.row), ...f.world.fns.map((x) => x.place.row), f.world.timers.length ? TIMER_PLACE.row : 0]);
    return sceneHeight(Math.max(...rows));
  }, [frames]);
  const player = usePlayer(frames, { interval: 1600 });
  const f = player.frame;

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      player={player}
      height={440}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'searching here' },
            { color: 'var(--ok)', label: 'found it' },
            { color: 'var(--violet)', label: 'environment · reference', shape: 'square' },
            { color: 'var(--info)', label: 'function object' },
            { color: 'var(--orange)', label: 'timer queue' },
            { color: 'var(--dim)', label: 'released' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Example" value={presetId} onChange={setPresetId} options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
        </Controls>
      }
    >
      <div className="cl">
        <div className="cl-side">
          <CodePanel title="JavaScript" lines={preset.code} active={f.line} />
          <ConsolePanel lines={f.world.out} />
          <Hint block>Simplified: engines only keep the variables a closure actually uses, and may optimise environments away.</Hint>
        </div>
        <Scene frame={f} height={height} />
      </div>
    </StageFrame>
  );
}

/** A dashed "outer" link from an environment to its parent. */
function OuterLink({ from, to }: { from: Rect; to: Rect }) {
  const arrow = useArrowMarker('var(--faint)', { size: 6, refX: 9 });
  const a = rectEdgeToward(from, rectCenter(to));
  const b = rectEdgeToward(to, rectCenter(from));
  return (
    <g className="cl-outer">
      {arrow.def}
      <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} markerEnd={arrow.url} />
    </g>
  );
}

function Scene({ frame, height }: { frame: ClFrame; height: number }) {
  const { world } = frame;
  const live = reachable(world);
  const captured = capturedEnvs(world);
  const envRect = (id: string) => {
    const e = world.envs.find((x) => x.id === id)!;
    return boxRect(e.place, e.vars.length);
  };
  const fnRect = (id: string) => boxRect(world.fns.find((x) => x.id === id)!.place, 1);

  const envTone = (id: string): Tone => (frame.found === id ? 'ok' : frame.searching === id ? 'hi' : 'violet');

  return (
    <svg className="cl-scene" viewBox={`0 0 ${SCENE_W} ${height}`} role="img" aria-label="Environments with outer links, and function objects pointing at the environment they captured">
      <text className="scene-zone" x={12} y={24}>environments</text>
      <text className="scene-zone" x={452} y={24}>functions</text>

      {world.envs.map((e) =>
        e.parent ? <OuterLink key={`outer-${e.id}`} from={envRect(e.id)} to={envRect(e.parent)} /> : null,
      )}

      {/* References under the boxes, so they read as links between boxes rather than across them. */}
      {world.fns.map((fn) => {
        // Environments sit to the left of functions: leave from the box's left edge, not across it.
        const at = placeAt(fn.place);
        const from = { x: at.x, y: heapFieldPort(at, BOX_W, 0).y };
        return <RefArrow key={`env-${fn.id}`} from={from} to={envRect(fn.env)} />;
      })}
      {world.envs.flatMap((e) =>
        e.vars.map((v, i) => {
          const target = v.value.kind === 'fn' ? v.value.id : null;
          if (!target || !world.fns.some((x) => x.id === target)) return null;
          return <RefArrow key={`${e.id}.${v.name}`} from={heapFieldPort(placeAt(e.place), BOX_W, i)} to={fnRect(target)} tone="info" />;
        }),
      )}
      {world.timers.map((id, i) => (
        <RefArrow key={`timer-${i}`} from={heapFieldPort(placeAt(TIMER_PLACE), BOX_W, i)} to={fnRect(id)} tone="orange" />
      ))}

      {world.envs.map((e) => {
        const released = !live.envs.has(e.id);
        return (
          <HeapObject
            key={e.id}
            at={placeAt(e.place)}
            w={BOX_W}
            title={e.label}
            tone={envTone(e.id)}
            highlight={frame.found === e.id || frame.searching === e.id}
            variant={released ? 'collectable' : 'live'}
            tag={released ? 'released' : captured.has(e.id) ? 'captured' : undefined}
            fields={e.vars.map((v) => (v.value.kind === 'fn' ? { name: v.name, isRef: true } : { name: v.name, value: v.value.kind === 'prim' ? v.value.text : '…' }))}
          />
        );
      })}

      {world.timers.length > 0 && (
        <HeapObject
          at={placeAt(TIMER_PLACE)}
          w={BOX_W}
          title="timer queue"
          tone="orange"
          fields={world.timers.map((_, i) => ({ name: `callback ${i + 1}`, isRef: true }))}
        />
      )}

      {world.fns.map((fn) => (
        <HeapObject
          key={fn.id}
          at={placeAt(fn.place)}
          w={BOX_W}
          title={fn.label}
          tone="info"
          variant={live.fns.has(fn.id) ? 'live' : 'collectable'}
          fields={[{ name: '[[Environment]]', value: '←' }]}
        />
      ))}
    </svg>
  );
}
