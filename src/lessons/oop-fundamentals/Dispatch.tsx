import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { HeapObject, RefArrow, heapFieldPort, heapHeight } from '../../components/memory';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ClassTree } from './ClassTree';
import { TREE_W, classRect } from './treeLayout';
import { dispatchFrames } from './frames';
import { CLASS_CODE, INSTANCES, instance, ownProperties, type ClassName, type InstanceId, type Method } from './model';
import { OOP_MIN_WIDTH } from './shared';

const INSTANCE_W = 170;
const SCENE_H = 400;
const SCENE_BOTTOM_PAD = 8;
/** Tallest object box: its title, every own property and the [[Prototype]] row. */
const MAX_INSTANCE_H = heapHeight(Math.max(...INSTANCES.map((i) => ownProperties(i.id).length)) + 1);
const INSTANCE_AT = { x: 16, y: SCENE_H - SCENE_BOTTOM_PAD - MAX_INSTANCE_H };

const METHODS: { value: Method; label: string }[] = [
  { value: 'area', label: 'area()' },
  { value: 'describe', label: 'describe()' },
  { value: 'setWidth', label: 'setWidth(5)' },
];

/** Call a method on an instance and watch the lookup climb the class chain. */
export function Dispatch({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<InstanceId>('square');
  const [method, setMethod] = useState<Method>('area');
  const frames = useMemo(() => dispatchFrames(id, method), [id, method]);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;
  const inst = instance(id);

  const mark = (c: ClassName) => (c === f.found ? { tone: 'ok' as const } : c === f.searching ? { tone: 'hi' as const } : null);
  const fields = [...ownProperties(id).map(([name, value]) => ({ name, value })), { name: '[[Prototype]]', isRef: true }];

  return (
    <StageFrame
      minWidth={OOP_MIN_WIDTH}
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Object" value={id} color="var(--info)" sub={`an instance of ${inst.cls}`} />
          <Stat label="Result" value={f.error ? 'TypeError' : (f.result ?? '…')} color={f.error ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'checking this class' },
            { color: 'var(--ok)', label: 'implementation found' },
            { color: 'var(--violet)', label: 'extends / [[Prototype]]', shape: 'line' },
            { color: 'var(--info)', label: 'the object' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Object" value={id} onChange={setId} options={INSTANCES.map((i) => ({ value: i.id, label: `${i.id} = ${i.create}` }))} />
          <Segmented label="Call" value={method} onChange={setMethod} options={METHODS} />
        </>,
      ]}
    >
      <div className="oo">
        <CodePanel title="JavaScript" lines={CLASS_CODE} active={f.line} />
        <svg className="oo-scene" viewBox={`0 0 ${TREE_W} ${SCENE_H}`} role="img" aria-label="Class hierarchy with the object and its prototype link">
          <text className="scene-zone" x={16} y={24}>classes</text>
          <ClassTree mark={mark} found={f.found ? { cls: f.found, method: f.method } : null} />
          <RefArrow from={heapFieldPort(INSTANCE_AT, INSTANCE_W, fields.length - 1)} to={classRect(inst.cls)} />
          <HeapObject at={INSTANCE_AT} w={INSTANCE_W} title={`${id}`} tone={f.atInstance ? 'hi' : 'info'} highlight={f.atInstance} fields={fields} />
        </svg>
      </div>
    </StageFrame>
  );
}
