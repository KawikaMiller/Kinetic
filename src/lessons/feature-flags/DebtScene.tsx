import { useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { KIND_INFO, KIND_ORDER, MONTHS, STALE_AFTER, combinations, debtCode, isStale, liveFlags, staleFlags } from './model';

export function DebtScene({ picker }: { picker: ReactNode }) {
  const [month, setMonth] = useState(MONTHS);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const live = liveFlags(month, removed);
  const stale = staleFlags(month, removed);
  const code = debtCode(live);
  const flagAt = (i: number) => (i < live.length ? live[i] : undefined);
  const paths = combinations(live.length);

  useIntroCaption(
    live.length === 0 ? (
      <>Month {month}: no flags in the checkout code yet. Drag the months on.</>
    ) : (
      <>
        Month {month}: {plural(live.length, 'flag')} in the checkout code, so {paths} combinations of on and off to cover if every path matters.{' '}
        {stale.length ? (
          <>
            <span className="hl orange">{plural(stale.length, 'flag')}</span> finished {STALE_AFTER}+ month{STALE_AFTER === 1 ? '' : 's'} ago and should be deleted.
          </>
        ) : (
          <>Nothing is stale yet.</>
        )}
      </>
    ),
    [month, live.length, stale.length, paths],
  );

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Flags in the code" value={live.length} />
          <Stat label="Stale" value={stale.length} color={stale.length ? 'var(--orange)' : undefined} />
          <Stat label="Combinations to test" value={paths} sub={`2 to the power ${live.length}`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'stale: remove me' }]} />}
      controls={[
        picker,
        <>
          <Slider label="Months since launch" value={month} min={0} max={MONTHS} onChange={setMonth} />
          <Button disabled={stale.length === 0} onClick={() => setRemoved(new Set([...removed, ...stale.map((f) => f.name)]))}>
            Remove stale flags
          </Button>
          <Button disabled={removed.size === 0} onClick={() => setRemoved(new Set())}>
            Put them back
          </Button>
        </>,
      ]}
    >
      <div className="ff stage-pad">
        <CodePanel
          title="checkout.ts"
          lines={code}
          trailing={(i) => (flagAt(i) && isStale(flagAt(i)!, month) ? <span className="ff-badge">remove me</span> : null)}
        />
        <ul className="ff-types">
          {KIND_ORDER.map((k) => (
            <li key={k}>
              <b>{KIND_INFO[k].label}</b>
              <span className="ff-life">{KIND_INFO[k].lifetime}</span>
              <span>{KIND_INFO[k].purpose}</span>
            </li>
          ))}
        </ul>
        <Hint block>
          A scripted year of flags for one team: lifetimes are typical habits, not rules. Each independent live flag doubles the combinations (nested or dependent flags give fewer); the two states of every flag need testing, not only the one you ship.
        </Hint>
      </div>
    </StageFrame>
  );
}
