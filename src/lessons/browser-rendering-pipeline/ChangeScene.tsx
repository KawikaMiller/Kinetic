import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames } from './frames';
import { PROPERTIES, PROPERTY_INFO, isCompositeOnly, stagesRerun, type Property, type StageId } from './model';
import { PipelineStrip, type StageStatus } from './PipelineStrip';

const STEP_MS = 900;
const OWN_LAYER_PROPERTIES: readonly Property[] = ['transform', 'opacity'];

/** The sandbox box's style: the base look, with only the chosen property switched to its second value. */
function sandboxStyle(property: Property, changed: boolean, promoted: boolean): CSSProperties {
  const style: CSSProperties = { transition: `${property} 0.6s ease` };
  if (property === 'width') style.width = changed ? 220 : 120;
  if (property === 'top') style.top = changed ? 28 : 0;
  if (property === 'color') style.color = changed ? 'var(--hi)' : 'var(--text)';
  if (property === 'background') style.background = changed ? 'color-mix(in srgb, var(--violet) 60%, transparent)' : 'color-mix(in srgb, var(--info) 30%, transparent)';
  if (property === 'box-shadow') style.boxShadow = changed ? '0 16px 26px -8px color-mix(in srgb, var(--hi) 60%, transparent)' : 'none';
  if (property === 'transform') style.transform = changed ? 'translateX(60px) rotate(8deg)' : 'none';
  if (property === 'opacity') style.opacity = changed ? 0.35 : 1;
  if (promoted && OWN_LAYER_PROPERTIES.includes(property)) style.willChange = property;
  return style;
}

/** The scene's first view: pick a property, play, and watch which stages light up. */
export function ChangeScene({ picker }: { picker: ReactNode }) {
  const [property, setProperty] = useState<Property>('width');
  const [promoted, setPromoted] = useState(false);
  const frames = useMemo(() => buildFrames(property, promoted), [property, promoted]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const frame = player.frame;
  const stages = stagesRerun(property, promoted);
  const cheap = isCompositeOnly(stages);

  const status = (stage: StageId): StageStatus => {
    if (!frame.changed) return 'idle';
    if (!stages.includes(stage)) return 'skipped';
    if (frame.current === stage) return 'current';
    return frame.ran.includes(stage) ? 'ran' : 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={400}
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'stage re-runs for this change' },
            { color: 'var(--ok)', label: 'composite-only path (layout and paint skipped)' },
            { color: 'var(--dim)', label: 'skipped' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Change this property" value={property} onChange={setProperty} options={PROPERTIES.map((p) => ({ value: p, label: p }))} />
        </>,
        <>
          <Toggle label="Layer" value={promoted} onChange={setPromoted} off="Shared with the page" on="Own layer (will-change)" />
          <Hint>{OWN_LAYER_PROPERTIES.includes(property) ? 'Own layer changes the path for transform and opacity.' : 'Own layer only changes the path for transform and opacity.'}</Hint>
        </>,
      ]}
    >
      <div className="stage-pad bp">
        <PipelineStrip status={status} tone={cheap ? 'ok' : 'hi'} />
        <div className="bp-sandbox" aria-label="Sandbox: the element being changed">
          <div className="bp-box" style={sandboxStyle(property, frame.changed, promoted)}>
            box
          </div>
        </div>
        <Hint block>
          Which stages re-run is the typical behaviour of Chromium-based browsers for a one-off change to{' '}
          <code>{property}</code> ({PROPERTY_INFO[property].trigger === 'layout' ? 'typically triggers layout' : PROPERTY_INFO[property].trigger === 'paint' ? 'typically triggers paint, not layout' : 'can typically skip layout and paint on its own layer'}).
          Top only counts on a positioned element. Engines differ, and DevTools&apos; Performance panel is the real authority. The sandbox box is real: it really changes.
        </Hint>
      </div>
    </StageFrame>
  );
}
