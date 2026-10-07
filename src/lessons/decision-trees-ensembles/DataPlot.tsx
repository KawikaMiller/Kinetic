import type { ReactNode } from 'react';
import { Heat, Plot2D, Points, type HeatValue } from '../../components/Plot2D';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented } from '../../components/ui';
import type { Point } from '../../core/plot';
import { AddPointCatcher, SampleDots } from './layers';
import { DOT_R } from './view';
import { DOMAIN, PRESET_IDS, PRESET_LABELS, type Cls, type Dataset, type PresetId, type Sample } from './model';

export const PLOT_W = 356;
export const PLOT_H = 262;
/** The learner can add this many points before the button refuses, so the trees stay drawable. */
export const MAX_ADDED = 40;

export interface Editor {
  preset: PresetId;
  added: readonly Sample[];
  cursor: Point;
  addClass: Cls;
  load: (id: PresetId) => void;
  add: (p: Point) => void;
  undo: () => void;
  setCursor: (p: Point) => void;
  setAddClass: (c: Cls) => void;
}

/**
 * The scatter every scene draws: model regions (Heat) underneath, then the scene's own
 * lines, then validation (hollow) and training points, misses ringed in red, and the
 * add-point cursor on top.
 */
export function DataPlot({ data, region, predict, radius, editor, ariaLabel, children }: {
  data: Dataset;
  region: (x: number, y: number) => HeatValue;
  predict: (s: Sample) => Cls;
  /** Training point radius (AdaBoost weights); fixed otherwise. */
  radius?: (i: number) => number;
  editor: Editor;
  ariaLabel: string;
  children?: ReactNode;
}) {
  return (
    <Plot2D x={{ domain: DOMAIN.x, label: 'x' }} y={{ domain: DOMAIN.y, label: 'y' }} width={PLOT_W} height={PLOT_H} className="dte-plot" ariaLabel={ariaLabel}>
      <Heat fn={region} resolution={72} />
      <AddPointCatcher onAdd={editor.add} />
      {children}
      <SampleDots samples={data.val} hollow radius={() => DOT_R} predict={predict} />
      <SampleDots samples={data.train} radius={radius ?? (() => DOT_R)} predict={predict} />
      <Points
        data={[{ x: editor.cursor[0], y: editor.cursor[1], tone: 'muted', hollow: true }]}
        r={5}
        onDrag={(_, p) => editor.setCursor(p)}
        pointLabel={() => 'Add-point cursor'}
      />
    </Plot2D>
  );
}

/** Presets plus the add-a-point controls (pointer: click the plot; keyboard: move the cursor, then Add). */
export function DataControls({ editor }: { editor: Editor }) {
  const full = editor.added.length >= MAX_ADDED;
  return (
    <>
      <ControlGroup label="Data">
        {PRESET_IDS.map((id) => (
          <ChipButton key={id} tone="info" on={editor.preset === id} onClick={() => editor.load(id)}>{PRESET_LABELS[id]}</ChipButton>
        ))}
      </ControlGroup>
      <Segmented
        label="New points"
        value={editor.addClass}
        onChange={editor.setAddClass}
        options={[{ value: 0, label: 'blue' }, { value: 1, label: 'violet' }]}
      />
      <Button onClick={() => editor.add(editor.cursor)} disabled={full}>Add at cursor</Button>
      <Button onClick={editor.undo} disabled={!editor.added.length}>Undo added point</Button>
      <Hint>
        {full ? `That's ${MAX_ADDED} added points, the most this demo takes.` : 'Click the plot to add a training point, or move the grey cursor with the arrow keys and press Add.'}
      </Hint>
    </>
  );
}

/** The class colours and point styles every scene shares, plus the scene's own entries. */
export function SceneLegend({ extra }: { extra: { color: string; label: string; shape: 'dot' | 'square' | 'line' }[] }) {
  return (
    <Legend
      items={[
        { color: 'var(--info)', label: 'blue class (points, region)', shape: 'dot' },
        { color: 'var(--violet)', label: 'violet class (points, region)', shape: 'dot' },
        { color: 'var(--bad)', label: 'ring: the model gets it wrong', shape: 'dot' },
        ...extra,
      ]}
    />
  );
}
