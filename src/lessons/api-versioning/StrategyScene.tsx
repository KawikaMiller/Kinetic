import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { CHANGES, DEFAULT_NAME, type ChangeId } from './api';
import { strategyCaption } from './captions';
import {
  MIGRATION_RANGE, RELEASE_RANGE, STRATEGIES, buildRequest, cacheRun, fateOf, liveVersions, requestLines, versionInHeader, yearlyCost, type StrategyId,
} from './strategies';

const STRATEGY_OPTIONS = STRATEGIES.map((s) => ({ value: s.id, label: s.label }));
const SHIPS_TONE = { 'in-place': 'ok', 'new-version': 'info', refused: 'bad' } as const;
const SHIPS_WORD = { 'in-place': 'ships in place', 'new-version': 'needs a new version', refused: 'refused' } as const;
/** The most versions the cost bar has to show: the slowest migration at the fastest cadence. */
const MOST_LIVE = liveVersions('path', RELEASE_RANGE.max, MIGRATION_RANGE.max);

export function StrategyScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [strategy, setStrategy] = useState<StrategyId>('path');
  const [changeId, setChangeId] = useState<ChangeId>('rename-field');
  const [sendVary, setSendVary] = useState(false);
  const [releases, setReleases] = useState(2);
  const [months, setMonths] = useState(18);

  const change = CHANGES.find((c) => c.id === changeId)!;
  const spec = STRATEGIES.find((s) => s.id === strategy)!;
  const fate = useMemo(() => fateOf(strategy, change, DEFAULT_NAME), [strategy, change]);
  const cache = cacheRun(strategy, sendVary);
  const live = liveVersions(strategy, releases, months);
  const caption = useMemo(() => strategyCaption(strategy, change, DEFAULT_NAME, sendVary, releases, months), [strategy, change, sendVary, releases, months]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  return (
    <StageFrame
      height={560}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'ships in place, or a cache that is right' },
            { color: 'var(--info)', label: 'needs a new version' },
            { color: 'var(--bad)', label: 'refused, or a cache that is wrong' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Versions live at once" value={live} sub={strategy === 'additive' ? 'one handler, no field removed' : `${plural(releases, 'release')} a year, ${plural(months, 'month')} to migrate`} />
          <Stat label="Upkeep, illustrative" value={`${yearlyCost(live)} days/yr`} sub="engineer-days a year" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Strategy" value={strategy} onChange={setStrategy} options={STRATEGY_OPTIONS} />
        </>,
        <>
          <label className="av-select-label">
            <span>The change</span>
            <select className="av-select" value={changeId} onChange={(e) => setChangeId(e.target.value as ChangeId)}>
              {CHANGES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          {versionInHeader(strategy) && <Toggle label="Response says Vary" value={sendVary} onChange={setSendVary} off="no Vary" on="Vary: Api-Version" />}
        </>,
        strategy === 'additive' ? (
          <p key="no-sliders" className="muted">Release rate and migration time are not used here: additive-only keeps one version, so pick another strategy to use them.</p>
        ) : (
          <>
            <Slider label="Releases a year" value={releases} min={RELEASE_RANGE.min} max={RELEASE_RANGE.max} onChange={setReleases} />
            <Slider label="Months to migrate" value={months} min={MIGRATION_RANGE.min} max={MIGRATION_RANGE.max} onChange={setMonths} />
          </>
        ),
      ]}
    >
      <div className="stage-pad av">
        <div className="av-pair">
          <CodePanel title="A client on v1 sends" lines={requestLines(buildRequest(strategy, 1))} gutter="none" />
          <CodePanel title="A client on v2 sends" lines={requestLines(buildRequest(strategy, 2))} gutter="none" />
        </div>

        <div className="av-pair">
          <Box className="av-card">
            <SectionTitle weight="regular">The change</SectionTitle>
            <p className="av-lead"><b>{change.label}</b></p>
            <span className={`chip tone-${SHIPS_TONE[fate.ships]}`}>{SHIPS_WORD[fate.ships]}</span>
            <p>{fate.text}</p>
          </Box>
          <Box className="av-card">
            <SectionTitle weight="regular">Where routing happens</SectionTitle>
            <p>{spec.routing}</p>
          </Box>
        </div>

        <Box className="av-card">
          <SectionTitle weight="regular" hint="a shared cache in front of the API">Can the cache tell the versions apart?</SectionTitle>
          <ul className="av-reasons">
            <li className="log-row tone-info">Client A (v1) asks first. The cache stores the answer under <code>{cache.keys[0]}</code>.</li>
            <li className={`log-row tone-${cache.correct ? 'ok' : 'bad'}`}>
              Client B (v2) asks: key <code>{cache.keys[1]}</code>, served <code>{cache.served}</code>
              {strategy === 'additive' ? ' (one representation for everyone).' : cache.correct ? ': the right version.' : ': the v1 body, the wrong version.'}
            </li>
          </ul>
        </Box>

        <Box className="av-card">
          <SectionTitle weight="regular" hint="illustrative">Versions kept alive</SectionTitle>
          <Bar value={live} max={MOST_LIVE} tone={live > 2 ? 'bad' : 'info'} height={10} ariaLabel={`${plural(live, 'version')} live at once`} />
          <p className="muted">
            {strategy === 'additive'
              ? 'One version is live, and the cost moves elsewhere: every field ever shipped stays in the response and in the tests (not modelled).'
              : 'Where the version goes does not change how many are live: that depends on how often you release and how long clients take to move.'}
          </p>
        </Box>
        <div className="av-chips">
          <Provenance kind="real">the request lines and the cache keys are built here as text</Provenance>
          <Provenance kind="illustrative">the upkeep per version and the migration times are invented</Provenance>
          <Provenance kind="from-memory">header names such as Api-Version are a convention, not a standard; Vary is HTTP's own mechanism</Provenance>
        </div>
        <Hint block>
          Caches usually include the query string in the key, with exceptions, so a version in the query keeps versions apart in this model. A cache that ignores the query would behave like the unvaried header row.
        </Hint>
      </div>
    </StageFrame>
  );
}
