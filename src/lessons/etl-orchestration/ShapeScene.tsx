import { useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { shapeCaption } from './captions';
import { initialShapeScene } from './init';
import { PIPELINES, dailyRun, rerunAfterRuleChange, type Style } from './shape';

const STYLES: { value: Style; label: string }[] = [
  { value: 'etl', label: 'ETL: clean on the pipeline' },
  { value: 'elt', label: 'ELT: clean in the warehouse' },
];

export function ShapeScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialShapeScene);
  const { style, changed } = state;
  const steps = PIPELINES[style];
  const rerun = rerunAfterRuleChange(style);
  const daily = dailyRun(style);

  useIntroCaption(shapeCaption(style, changed), [style, changed]);

  const nodes = steps.map((s) => ({ id: s.id, shape: 'box' as const, label: `${s.id} · ${s.where}` }));
  const edges = steps.flatMap((s) => s.after.map((a) => ({ from: a, to: s.id })));

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Daily run" value={`${daily.steps} steps`} sub={`${plural(daily.extractRuns, 'read')} of the source`} />
          <Stat label="After a rule change" value={changed ? `${rerun.steps.length} steps` : '–'} color={changed ? (style === 'etl' ? 'var(--bad)' : 'var(--ok)') : undefined} sub={changed ? `${plural(rerun.extractRuns, 'source read')}` : 'press the button'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a step that runs again after the cleaning rule changes', shape: 'square' },
            { color: 'var(--dim)', label: 'a step that does not', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Segmented label="Pipeline" value={style} onChange={(s) => setState((st) => ({ ...st, style: s }))} options={STYLES} />
          <Button variant="primary" onClick={() => setState((s) => ({ ...s, changed: true }))} softDisabled={changed}>Change the cleaning rule</Button>
          <Button onClick={() => setState((s) => ({ ...s, changed: false }))} softDisabled={!changed}>Back</Button>
        </>
      }
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint="the same five jobs, arranged two ways">The pipeline as a DAG</SectionTitle>
          <div className="eo-dag">
            <GraphView
              key={style}
              nodes={nodes}
              edges={edges}
              directed
              layout="layered"
              spacing={{ direction: 'right', layerGap: 54, nodeGap: 36, padMain: 16, padCross: 16 }}
              box={{ w: 190, h: 32 }}
              nodeMark={(id) => (changed ? (rerun.steps.includes(String(id)) ? { tone: 'hi', fill: 'tint' } : { tone: 'dim', fill: 'tint' }) : null)}
              ariaLabel={`The ${style} pipeline: five steps and what each waits for`}
            />
          </div>
        </Box>
        <Box>
          <SectionTitle hint="counted in steps, and in times the source is read">What a rule change costs</SectionTitle>
          <p className="eo-note">
            {changed
              ? `${style === 'etl' ? 'ETL' : 'ELT'} runs again: ${rerun.steps.join(', ')}.`
              : `A normal day runs all ${daily.steps} steps. Press "Change the cleaning rule" to see which of them must run again.`}
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">a made-up pipeline of five steps; real ones have dozens, and an ETL tool can keep intermediate files, which this model does not</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
