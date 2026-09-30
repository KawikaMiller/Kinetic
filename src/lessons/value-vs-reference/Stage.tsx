import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { HeapObject, RefArrow, VarSlot, heapFieldPort, heapRect, slotPort } from '../../components/memory';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented } from '../../components/ui';
import type { Pt } from '../../core/geometry';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { PRESETS, type VrFrame } from './frames';
import { fanBend, HEAP_W, layoutScene, SCENE_W, type SceneLayout } from './layout';
import { shown, unreachable } from './model';
import './styles.css';

/** Narrowest stage where the scene's smallest text (10px tags) still renders at 8px or more. */
const MIN_WIDTH = 900;

export function Stage() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const frames = useMemo(() => preset.build(), [preset]);
  const layout = useMemo(() => layoutScene(frames.map((f) => f.mem)), [frames]);
  const player = usePlayer(frames, { interval: 1700 });
  const f = player.frame;

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'running now' },
            { color: 'var(--info)', label: 'object on the heap' },
            { color: 'var(--violet)', label: 'reference', shape: 'line' },
            { color: 'var(--ok)', label: 'sees the change' },
            { color: 'var(--bad)', label: 'error' },
            { color: 'var(--dim)', label: 'garbage' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Snippet" value={presetId} onChange={setPresetId} options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
        </Controls>
      }
    >
      <div className="vr">
        <div className="vr-side">
          <CodePanel title="JavaScript" lines={preset.code} active={f.line} />
          <span className="chip tone-violet vr-lang">Python &amp; Java: same for objects</span>
          <ConsolePanel lines={f.mem.out} error={f.mem.error} />
        </div>
        <Scene frame={f} layout={layout} />
      </div>
    </StageFrame>
  );
}

interface Arrow {
  key: string;
  from: Pt;
  to: string;
}

function Scene({ frame, layout }: { frame: VrFrame; layout: SceneLayout }) {
  const { mem } = frame;
  const aliveScopes = new Set(mem.scopes.filter((s) => s.alive).map((s) => s.id));
  const garbage = unreachable(mem);
  const heapAt = (id: string) => layout.heap.get(id)!;

  // Every reference currently held: from a live name, or from a field of a heap object.
  const arrows: Arrow[] = [];
  for (const b of mem.bindings) {
    if (b.val.kind === 'ref' && aliveScopes.has(b.scope)) arrows.push({ key: b.id, from: slotPort(layout.slots.get(b.id)!), to: b.val.id });
  }
  for (const o of mem.heap) {
    o.fields.forEach((field, i) => {
      if (field.val.kind === 'ref') arrows.push({ key: `${o.id}.${field.name}`, from: heapFieldPort(heapAt(o.id), HEAP_W, i), to: field.val.id });
    });
  }
  const intoTarget = (a: Arrow) => arrows.filter((x) => x.to === a.to);

  return (
    <svg className="vr-scene" viewBox={`0 0 ${SCENE_W} ${layout.height}`} role="img" aria-label="Names on the left, heap objects on the right, arrows for references">
      <text className="scene-zone" x={16} y={24}>names</text>
      <text className="scene-zone" x={262} y={24}>heap</text>

      {layout.scopes.map((s) => {
        const scope = mem.scopes.find((x) => x.id === s.id);
        if (!scope) return null;
        return (
          <text key={s.id} className={`vr-scope-label ${scope.alive ? '' : 'is-gone'}`} x={16} y={s.y + 11}>
            {scope.alive ? s.label : `${s.label} · returned`}
          </text>
        );
      })}

      {mem.bindings.map((b) => {
        const dead = !aliveScopes.has(b.scope);
        const tone: Tone = frame.blame === b.id ? 'bad' : frame.seen.includes(b.id) ? 'ok' : b.val.kind === 'ref' ? 'violet' : 'info';
        return (
          <VarSlot
            key={b.id}
            at={layout.slots.get(b.id)!}
            name={b.name}
            isRef={b.val.kind === 'ref' && !dead}
            value={dead ? '—' : b.val.kind === 'prim' ? shown(b.val.value) : undefined}
            tone={tone}
            highlight={tone === 'ok' || tone === 'bad'}
            dead={dead}
          />
        );
      })}

      {mem.heap.map((o) => (
        <HeapObject
          key={o.id}
          at={heapAt(o.id)}
          w={HEAP_W}
          title={o.label}
          fields={o.fields.map((field) => (field.val.kind === 'ref' ? { name: field.name, isRef: true } : { name: field.name, value: shown(field.val.value) }))}
          variant={garbage.has(o.id) ? 'collectable' : 'live'}
          tag={garbage.has(o.id) ? 'garbage' : undefined}
          highlight={frame.mutated === o.id}
        />
      ))}

      {arrows.map((a) => {
        const siblings = intoTarget(a);
        const target = mem.heap.find((o) => o.id === a.to)!;
        return (
          <RefArrow
            key={a.key}
            from={a.from}
            to={heapRect(heapAt(a.to), HEAP_W, target.fields.length)}
            bend={fanBend(siblings.indexOf(a), siblings.length)}
          />
        );
      })}
    </svg>
  );
}
