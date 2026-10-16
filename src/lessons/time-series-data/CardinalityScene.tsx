import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes } from '../../core/format';
import { cardinalityCaption } from './captions';
import { initialCardinalityScene } from './init';
import { LABEL_MAX, OCCURRENCE, USER_IDS, bytesPerDay, seriesCount, type Labels } from './retention';

const LABELS: (keyof Labels)[] = ['service', 'endpoint', 'status', 'host'];

export function CardinalityScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCardinalityScene);
  const { labels, withUser, share } = state;
  const upper = seriesCount(labels, withUser);
  const series = seriesCount(labels, withUser, share);
  const withoutUser = seriesCount(labels, false, share);
  const perDay = bytesPerDay(series);
  const all = share === 1;
  const occurs = all ? null : OCCURRENCE.find((o) => o.share === share)!.label;

  useIntroCaption(cardinalityCaption(upper, series, withUser, perDay, occurs), [labels, withUser, share]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label={all ? 'Series, at most' : 'Series'} value={series.toLocaleString('en-US')} color={withUser ? 'var(--bad)' : undefined} sub={[...(withUser ? [`${withoutUser.toLocaleString('en-US')} without user_id`] : []), all ? 'upper bound: every combination occurs' : `of at most ${upper.toLocaleString('en-US')}`]} />
          <Stat label={all ? 'Raw points a day, at most' : 'Raw points a day'} value={bytes(perDay)} color={withUser ? 'var(--bad)' : undefined} sub="at 16 bytes a point" />
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
        <>
          <Toggle label="Add a user_id label" value={withUser} onChange={(v) => setState((s) => ({ ...s, withUser: v }))} off="No" on={`Yes (${USER_IDS.toLocaleString('en-US')} values)`} />
          <Segmented label="Combinations that occur" value={share} onChange={(v) => setState((s) => ({ ...s, share: v }))} options={OCCURRENCE.map((o) => ({ value: o.share, label: o.label }))} />
        </>,
      ]}
    >
      <div className="ts-stage stage-pad">
        <Box>
          <SectionTitle hint="a series is a metric name plus one value for each label">The multiplication</SectionTitle>
          <p className="ts-product" aria-label={`${upper} combinations at most${all ? '' : `, ${series} series`}`}>
            {LABELS.map((k) => labels[k]).join(' × ')}
            {withUser ? ` × ${USER_IDS.toLocaleString('en-US')}` : ''} = <b>{upper.toLocaleString('en-US')}</b> combinations at most
            {!all && <>; {occurs} occur: <b>{series.toLocaleString('en-US')}</b> series</>}
          </p>
          <p className="ts-note">service × endpoint × status × host{withUser ? ' × user_id' : ''}. The product is the most there can be: it is reached only when every combination of values occurs, and labels that go together (a host runs one service) leave fewer. See the observability lesson for why labels are worth their cost.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">label counts and the shares of combinations that occur are made up; real systems differ in how they index series and what a series costs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
