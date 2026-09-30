import { useState, type ReactNode } from 'react';
import { RefArrow } from '../../components/memory';
import { SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ClassTree, type ClassMark } from './ClassTree';
import { TREE_W, classRect } from './treeLayout';
import { affectedByBaseChange, type ClassName } from './model';
import { OOP_MIN_WIDTH } from './shared';

const SCENE_H = 380;
const RENDERER_AT = { x: 90, y: 320 };
const RENDERER = { w: 130, h: 44 };
/** Under composition, only Circle chose to hold a renderer. */
const OPTED_IN: ClassName[] = ['Circle'];

/** Add a side effect to the base: under inheritance it ripples everywhere, under composition only where you plugged it in. */
export function Composition({ picker }: { picker: ReactNode }) {
  const [design, setDesign] = useState<'inherit' | 'compose'>('inherit');
  const [changed, setChanged] = useState(false);
  const setCaption = useSetCaption();
  useIntroCaption(<>Designers want every shape drawn. Option one: put <code>render()</code> in the base class. Option two: give shapes a separate Renderer part. Pick one, then press the button.</>);

  const affected = changed ? affectedByBaseChange(design, OPTED_IN) : [];

  const mark = (c: ClassName): ClassMark | null => {
    if (!affected.includes(c)) return null;
    return design === 'inherit' ? { tone: 'bad', variant: 'bad', note: 'now renders' } : { tone: 'violet', note: 'renders (opted in)' };
  };

  const toggleChange = () => {
    const next = !changed;
    setChanged(next);
    if (!next) setCaption(<>Back to the original classes.</>);
    else if (design === 'inherit') setCaption(<><code>render()</code> added to <b>Shape</b> ripples into <span className="hl bad">every subclass</span>, even ones that never asked for it. That&apos;s the fragile base class problem.</>);
    else setCaption(<>The side effect lives in the <b>Renderer</b> part. Only <span className="hl violet">Circle</span>, which holds one, changes. Nothing else even notices.</>);
  };

  const pickDesign = (d: 'inherit' | 'compose') => {
    setDesign(d);
    setChanged(false);
    setCaption(d === 'inherit' ? <>Inheritance: every shape <b>is a</b> Shape and gets whatever Shape has.</> : <>Composition: a shape <b>has a</b> Renderer only if you give it one.</>);
  };

  return (
    <StageFrame
      minWidth={OOP_MIN_WIDTH}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'changed by the base-class edit' },
            { color: 'var(--violet)', label: 'composed part / has-a' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="Design" value={design === 'compose'} onChange={(v) => pickDesign(v ? 'compose' : 'inherit')} off="Inheritance" on="Composition" />
          <Button variant="primary" onClick={toggleChange}>{changed ? 'Undo the change' : 'Add a render() side effect'}</Button>
        </>,
      ]}
    >
      <div className="oo oo-wide">
        <svg className="oo-scene" viewBox={`0 0 ${TREE_W} ${SCENE_H}`} role="img" aria-label="Class hierarchy and, under composition, a Renderer part">
          <text className="scene-zone" x={16} y={24}>{design === 'inherit' ? 'is-a: inheritance' : 'has-a: composition'}</text>
          <ClassTree mark={mark} />
          {design === 'compose' && (
            <>
              <RefArrow
                from={{ x: classRect('Circle').x, y: classRect('Circle').y + classRect('Circle').h / 2 }}
                to={{ x: RENDERER_AT.x - RENDERER.w / 2, y: RENDERER_AT.y - RENDERER.h / 2, w: RENDERER.w, h: RENDERER.h }}
                tone="violet"
              />
              <SceneNode at={RENDERER_AT} w={RENDERER.w} h={RENDERER.h} title="Renderer" sub={changed ? 'render() + side effect' : 'render()'} tone="violet" on className="oo-part" />
            </>
          )}
        </svg>
      </div>
    </StageFrame>
  );
}
