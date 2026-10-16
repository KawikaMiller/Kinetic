import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Box, SectionTitle } from '../../components/Panel';
import { WideRegion } from '../../components/WideRegion';
import { useRadioGroup } from '../../components/useRadioGroup';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { widgetCaption, msText } from './captions';
import { PRESETS, applyPreset, initialWidgets, type WidgetsState } from './init';
import {
  RUNGS, RUNG_NAME, SERVICE_NAME, WIDGETS, WIDGET_NAME, WIDGET_SERVICE, journey, pageMs, softSweep, staleAgeMin, stateWord, tagVerdicts, widgetStates,
  type Health, type Rung, type ServiceId, type WidgetId, type WidgetState,
} from './model';
import { SERVICE_GRAPH_MIN_WIDTH, ServiceGraph } from './ServiceGraph';

const NEXT_HEALTH: Record<Health, Health> = { up: 'slow', slow: 'down', down: 'up' };
const OUTAGE_MAX_MIN = 30;

const toneOf = (s: WidgetState): string => ({ live: 'ok', 'live-slow': 'orange', stale: 'hi', static: 'violet', hidden: 'dim', error: 'bad' })[s];

function cardText(state: WidgetState, outageMin: number): string {
  if (state === 'stale') return `stale: updated ${staleAgeMin(outageMin)} min ago`;
  return stateWord(state);
}

export function WidgetScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<WidgetsState>(initialWidgets);
  const options = useMemo(() => ({ buyWaitsForRecs: s.buyWaitsForRecs }), [s.buyWaitsForRecs]);
  const states = useMemo(() => widgetStates(s.health, s.policies, options), [s.health, s.policies, options]);
  const steps = useMemo(() => journey(s.health, s.policies, options), [s.health, s.policies, options]);
  const sweep = useMemo(() => softSweep(s.tags, s.policies, options), [s.tags, s.policies, options]);
  const verdicts = useMemo(() => tagVerdicts(s.tags, s.policies, options), [s.tags, s.policies, options]);
  const problems = verdicts.filter((v) => v.problem);
  const works = steps.every((x) => x.ok);
  const blocked = steps.find((x) => !x.ok);
  const selected = s.selected;
  const service = WIDGET_SERVICE[selected];
  const selectedVerdict = verdicts.find((v) => v.service === service);

  const cards = useRadioGroup(WIDGETS.length, WIDGETS.indexOf(selected), (i) => setS((x) => ({ ...x, selected: WIDGETS[i] })));
  const cycle = (id: ServiceId) => setS((x) => ({ ...x, health: { ...x.health, [id]: NEXT_HEALTH[x.health[id]] } }));

  const captionKey = `${JSON.stringify(s.health)}|${JSON.stringify(s.policies)}|${s.buyWaitsForRecs}|${s.outageMin}`;
  useIntroCaption(widgetCaption(s.health, s.policies, options, s.outageMin), [captionKey]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Page time" value={msText(pageMs(s.health, s.policies, options))} sub={['the slowest widget decides', 'illustrative milliseconds']} />
          <Stat label="Core journey" value={works ? 'works' : 'blocked'} color={works ? 'var(--ok)' : 'var(--bad)'} sub={blocked ? [`blocked at ${blocked.label}`] : ['view, cart and pay all complete']} />
          <Stat
            label="Soft failures that break it"
            value={sweep.failing ? `{${sweep.failing.join(', ')}}` : `none of ${sweep.checked}`}
            color={sweep.failing ? 'var(--bad)' : 'var(--ok)'}
            sub={[`${sweep.checked} subsets of the ${Math.log2(sweep.checked)} soft services, each failed together`]}
          />
          <Stat label="Tags the journey disagrees with" value={problems.length} color={problems.length ? 'var(--bad)' : undefined} sub={problems.length ? problems.map((p) => SERVICE_NAME[p.service]) : ['every tag matches']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'live' },
            { color: 'var(--hi)', label: 'stale, with its age' },
            { color: 'var(--violet)', label: 'static default' },
            { color: 'var(--dim)', label: 'hidden' },
            { color: 'var(--bad)', label: 'error, or a failed service' },
            { color: 'var(--orange)', label: 'a slow service' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" onClick={() => setS((x) => applyPreset(x, p.id))}>{p.label}</ChipButton>
          ))}
          <Button onClick={() => setS(initialWidgets())}>Reset</Button>
        </>,
        <>
          <Segmented
            label={`${WIDGET_NAME[selected]} falls back to`}
            value={s.policies[selected]}
            onChange={(rung: Rung) => setS((x) => ({ ...x, policies: { ...x.policies, [selected]: rung } }))}
            options={RUNGS.map((r) => ({ value: r, label: RUNG_NAME[r] }))}
          />
          <Toggle
            label={`${SERVICE_NAME[service]} is tagged`}
            value={s.tags[service] === 'hard'}
            onChange={(hard) => setS((x) => ({ ...x, tags: { ...x.tags, [service]: hard ? 'hard' : 'soft' } }))}
            off="soft"
            on="hard"
          />
        </>,
        <>
          <Slider label="Outage so far" value={s.outageMin} min={0} max={OUTAGE_MAX_MIN} format={(v) => `${v} min`} onChange={(outageMin) => setS((x) => ({ ...x, outageMin }))} />
          <Toggle
            label="Buy button"
            value={s.buyWaitsForRecs}
            onChange={(buyWaitsForRecs) => setS((x) => ({ ...x, buyWaitsForRecs }))}
            off="independent"
            on="also waits on recommendations"
          />
        </>,
      ]}
    >
      <div className="gd-stage stage-pad">
        <div className="gd-top">
          <Box className="gd-widgets">
            <SectionTitle hint="select one to set its fallback">The page, widget by widget</SectionTitle>
            <div className="gd-grid" role="radiogroup" aria-label="Page widgets">
              {WIDGETS.map((w: WidgetId, i) => (
                <button
                  key={w}
                  type="button"
                  {...cards.itemProps(i)}
                  className={`gd-card is-${states[w]} ${w === selected ? 'is-selected' : ''}`}
                  onClick={() => setS((x) => ({ ...x, selected: w }))}
                  style={{ '--c': `var(--${toneOf(states[w])})` } as CSSProperties}
                >
                  <span className="gd-card-name">{WIDGET_NAME[w]}</span>
                  <span className="gd-card-state">{cardText(states[w], s.outageMin)}</span>
                  <span className="gd-card-rung">reads {SERVICE_NAME[WIDGET_SERVICE[w]]}; if it fails: {RUNG_NAME[s.policies[w]]}</span>
                </button>
              ))}
            </div>
          </Box>
          <WideRegion minWidth={SERVICE_GRAPH_MIN_WIDTH} label="Service graph: scroll sideways to see all of it">
            <ServiceGraph health={s.health} tags={s.tags} journeyOk={works} onCycle={cycle} />
          </WideRegion>
        </div>
        <Box className="gd-journey">
          <SectionTitle hint="view, then add to cart, then pay">Core journey checker</SectionTitle>
          <ol className="gd-steps">
            {steps.map((st) => (
              <li key={st.id} className={st.ok ? 'is-ok' : 'is-blocked'}>
                <b>{st.label}</b>: {st.ok ? 'completes' : `blocked, because ${st.reason}`}
              </li>
            ))}
          </ol>
          {selectedVerdict?.problem && <p className="gd-warning">{SERVICE_NAME[service]} is {selectedVerdict.problem}.</p>}
          {sweep.failing && <p className="gd-warning">Failing {sweep.failing.map((f) => SERVICE_NAME[f]).join(' and ')} alone breaks the journey, though {sweep.failing.length === 1 ? 'it is' : 'they are'} tagged soft.</p>}
        </Box>
        <Hint tone="muted" block>
          Click or press Enter on a service in the graph: up, then slow, then down. A dashed line is a soft dependency, a solid one hard. Money fails closed: a stale price may be shown, but a charge needs the live one.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">an invented shop: the services, which widget reads which, the page times and the 30-minute outage range are made up</Provenance>
          <Provenance kind="simulated">the journey and the sweep are computed from the model; no randomness here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
