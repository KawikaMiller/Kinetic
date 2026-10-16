import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes } from '../../core/format';
import { cardinalityCaption } from './captions';
import { initialCardinalityScene } from './init';
import { LABEL_MAX, USER_IDS, bytesPerDay, seriesCount, type Labels } from './retention';

const LABELS: (keyof Labels)[] = ['service', 'endpoint', 'status', 'host'];

export function CardinalityScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCardinalityScene);
  const { labels, withUser } = state;
  const series = seriesCount(labels, withUser);
  const withoutUser = seriesCount(labels, false);
  const perDay = bytesPerDay(series);

  useIntroCaption(cardinalityCaption(series, withUser, perDay), [labels, withUser]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Series" value={series.toLocaleString('en-US')} color={withUser ? 'var(--bad)' : undefined} sub={withUser ? `${withoutUser.toLocaleString('en-US')} without user_id` : 'one per label combination'} />
          <Stat label="Raw points a day" value={bytes(perDay)} color={withUser ? 'var(--bad)' : undefined} sub="at 16 bytes a point" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'a label with many values multiplies everything else', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          {LABELS.map((k) => (
            <Slider key={k} label={k} value={labels[k]} min={1} max={LABEL_MAX[k]} onChange={(v) => setState((s) => ({ ...s, labels: { ...s.labels, [k]: v } }))} />
          ))}
        </>,
        <Toggle key="user" label="Add a user_id label" value={withUser} onChange={(v) => setState((s) => ({ ...s, withUser: v }))} off="No" on={`Yes (${USER_IDS.toLocaleString('en-US')} values)`} />,
      ]}
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="a series is a metric name plus one value for each label">The multiplication</SectionTitle>
          <p className="ts-product" aria-label={`${series} series`}>
            {LABELS.map((k) => labels[k]).join(' × ')}
            {withUser ? ` × ${USER_IDS.toLocaleString('en-US')}` : ''} = <b>{series.toLocaleString('en-US')}</b>
          </p>
          <p className="ts-note">service × endpoint × status × host{withUser ? ' × user_id' : ''}. See the observability lesson for why labels are worth their cost.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">label counts are made up; real systems differ in how they index series and what a series costs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
