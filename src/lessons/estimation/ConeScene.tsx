import { useMemo, useState, type ReactNode } from 'react';
import { Band, Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { coneCaption } from './captions';
import { CONE_PHASES, CONE_SEED, OUTCOME_MODELS, bandRatio, coneAt, outcomePoints, outsideCone, type OutcomeModel } from './model';
import { OPENING } from './opening';

type Show = 'none' | OutcomeModel;
const SHOW_OPTIONS: { value: Show; label: string }[] = [{ value: 'none', label: 'Cone only' }, ...OUTCOME_MODELS];

const PLOT_WIDTH = 560;
const Y_TICKS = [0.25, 0.5, 1, 2, 4];
const last = CONE_PHASES.length - 1;

/** Scene 1: the cone, and what a scatter of invented outcomes looks like inside and outside it. */
export function ConeScene({ picker }: { picker: ReactNode }) {
  const [show, setShow] = useState<Show>(OPENING.cone.show);
  const points = useMemo(() => (show === 'none' ? null : outcomePoints(show)), [show]);
  const outside = points ? outsideCone(points) : 0;

  return (
    <StageFrame
      height={420}
      intro={coneCaption(points, show === 'cone')}
      introKey={show}
      stats={
        <Stats>
          <Stat label="Band at the concept" value={`${sig(bandRatio(CONE_PHASES[0]), 3)}x wide`} sub={`${CONE_PHASES[0].low}x to ${CONE_PHASES[0].high}x the outcome`} />
          <Stat label="Band at detailed design" value={`${sig(bandRatio(CONE_PHASES[last]), 3)}x wide`} sub={`${CONE_PHASES[last].low}x to ${CONE_PHASES[last].high}x the outcome`} />
          <Stat label="Outside their band" value={points ? `${outside} of ${points.length}` : '–'} color={points && outside > 0 ? 'var(--bad)' : undefined} sub={points ? (show === 'cone' ? 'invented, drawn inside their band' : 'invented outcomes') : 'pick an outcome model'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: "the cone's estimate band", shape: 'square' },
            { color: 'var(--hi)', label: 'an invented outcome inside its band' },
            { color: 'var(--bad)', label: 'an invented outcome outside its band' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Invented outcomes" options={SHOW_OPTIONS} value={show} onChange={setShow} />
        </>,
      ]}
    >
      <div className="es-stage stage-pad">
        <WideRegion minWidth={PLOT_WIDTH} label="The cone of uncertainty: scroll sideways to see all of it">
          <Plot2D
            x={{ domain: [-0.5, last + 0.5], tickValues: CONE_PHASES.map((_, i) => i), format: (v) => CONE_PHASES[Math.round(v)]?.short ?? '' }}
            y={{ domain: [0.2, 5], log: true, tickValues: Y_TICKS, format: (v) => `${v}x`, label: 'estimate as a multiple of the final outcome' }}
            width={PLOT_WIDTH}
            height={300}
            ariaLabel="The cone of uncertainty: the band of estimate-to-outcome ratios narrows from 0.25x to 4x at the initial concept to 0.9x to 1.1x at detailed design"
          >
            <Band lo={(x) => coneAt(x).low} hi={(x) => coneAt(x).high} from={0} to={last} tone="info" />
            <Curve fn={(x) => (x >= 0 && x <= last ? coneAt(x).low : NaN)} tone="info" />
            <Curve fn={(x) => (x >= 0 && x <= last ? coneAt(x).high : NaN)} tone="info" />
            <HLine at={1} tone="dim" label="the final outcome" />
            {points && (
              <Points
                data={points.map((p) => ({ x: p.x, y: p.ratio, tone: p.ratio < CONE_PHASES[p.phase].low || p.ratio > CONE_PHASES[p.phase].high ? 'bad' : 'hi' }))}
                r={3.5}
              />
            )}
          </Plot2D>
        </WideRegion>
        <ProvenanceRow>
          <ClaimLabel kind="research">Boehm&apos;s cone as popularised by McConnell: the five bands are from memory, check Boehm (1981) and McConnell&apos;s Software Estimation</ClaimLabel>
          <ClaimLabel kind="view">a published critique argues the cone is a best case that does not narrow by itself; check the source before naming an author</ClaimLabel>
          {points && <Provenance kind="toy" seed={CONE_SEED}>invented projects: each estimate-to-outcome ratio is drawn log-uniformly from a range, not measured from any real project</Provenance>}
          <Provenance kind="illustrative">the bands are named constants, not a law of projects</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
