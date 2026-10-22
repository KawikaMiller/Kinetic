import { useState, type ReactNode } from 'react';
import { Band, Curve, HLine, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { dollars, pctText } from '../../core/format';
import {
  CAPACITY_RPS, HOURS, P_C, P_OD, PRESETS, RPS_LIMITS, dayCost, neededPerHour, optimumByScan, peakNeed, type PresetId, type Profile, type Work,
} from './cost';
import { BoundedIntField } from '../../components/BoundedIntField';
import { OPENING, commitRule, dayCaption, spotReason } from './view';

const CHART_W = 500;
const CHART_H = 150;
const BAR_W = 16;
const BAR_GAP = 4;
const SPOT_NOTE_ID = 'fin-spot-note';

const WORKS: { value: Work; label: string }[] = [
  { value: 'user', label: 'user-facing requests' },
  { value: 'queue', label: 'restartable queue work' },
];

/** The cost curve between its whole-instance points, straight lines as drawn. */
function interpolate(curve: readonly (readonly [number, number])[], x: number): number {
  const i = Math.min(curve.length - 2, Math.max(0, Math.floor(x)));
  if (curve.length < 2) return curve[0]?.[1] ?? 0;
  const [x0, y0] = curve[i];
  const [x1, y1] = curve[i + 1];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

const sameProfile = (a: Profile, b: Profile) => a.length === b.length && a.every((v, i) => v === b[i]);

function Hours({ profile, committed, spot }: { profile: Profile; committed: number; spot: boolean }) {
  const need = neededPerHour(profile);
  const top = Math.max(1, peakNeed(profile), committed);
  const unit = (CHART_H - 14) / top;
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H + 14}`} width="100%" role="img" aria-label={`Instances needed in each of 24 hours against ${committed} committed`}>
      {need.map((n, h) => {
        const x = 10 + h * (BAR_W + BAR_GAP);
        const used = Math.min(n, committed) * unit;
        const idle = Math.max(0, committed - n) * unit;
        const burst = Math.max(0, n - committed) * unit;
        const base = CHART_H;
        return (
          <g key={h}>
            <rect x={x} y={base - used} width={BAR_W} height={used} fill="var(--info)" />
            <rect x={x} y={base - used - idle} width={BAR_W} height={idle} fill="var(--bad)" fillOpacity={0.5} />
            <rect x={x} y={base - used - burst} width={BAR_W} height={burst} fill={spot ? 'var(--violet)' : 'var(--hi)'} />
            {h % 4 === 0 && <text x={x} y={base + 11} fontSize={11} fill="var(--muted)">{h}h</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Scene 1: what a day costs under a 24-hour load profile, and what committing capacity does to it. */
export function DayScene({ picker }: { picker: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(PRESETS.web.profile);
  const [committed, setCommitted] = useState<number>(OPENING.committed);
  const [work, setWork] = useState<Work>(OPENING.work);
  const [spot, setSpot] = useState<boolean>(OPENING.spot);
  const [hour, setHour] = useState<number>(OPENING.hour);

  const peak = peakNeed(profile);
  const here = dayCost(profile, committed, spot);
  const none = dayCost(profile, 0, spot).total;
  const best = optimumByScan(profile, spot);
  const curve = Array.from({ length: peak + 1 }, (_, c) => [c, dayCost(profile, c, spot).total] as [number, number]);
  const top = Math.max(1, ...curve.map((p) => p[1])) * 1.1;
  const overCommit = (c: number) => Math.max(none, interpolate(curve, c));
  const reason = spotReason(work);
  const presetId = (Object.keys(PRESETS) as PresetId[]).find((id) => sameProfile(PRESETS[id].profile, profile)) ?? null;

  const load = (next: Profile) => {
    setProfile(next);
    setCommitted((c) => Math.min(c, peakNeed(next)));
  };
  const setRps = (rps: number) => load(profile.map((v, h) => (h === hour ? rps : v)));
  const chooseWork = (w: Work) => {
    setWork(w);
    if (w === 'user') setSpot(false);
  };

  return (
    <StageFrame
      height={680}
      intro={dayCaption(profile, committed, spot)}
      introKey={`day|${profile.join(',')}|${committed}|${work}|${spot}`}
      stats={
        <Stats>
          <Stat label="Illustrative cost per day" value={dollars(here.total)} sub={[`committed ${dollars(here.committed)}`, `burst ${dollars(here.burst)}`]} />
          <Stat label="Cost per million requests" value={here.perMillion === null ? 'no traffic' : dollars(here.perMillion)} sub={here.perMillion === null ? 'there is no cost per request to show' : 'illustrative, from this profile'} />
          <Stat label="Paid capacity used" value={here.utilisation === null ? 'no traffic' : pctText(here.utilisation, 1)} color={here.utilisation !== null && here.utilisation < 0.7 ? 'var(--bad)' : undefined} sub="needed instance-hours over paid ones" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'committed capacity in use', shape: 'square' },
            { color: 'var(--bad)', label: 'committed capacity paid for and idle', shape: 'square' },
            { color: 'var(--hi)', label: 'burst paid on demand', shape: 'square' },
            { color: 'var(--violet)', label: 'burst on interruptible capacity', shape: 'square' },
            { color: 'var(--ok)', label: 'the cheapest level', shape: 'dot' },
            { color: 'var(--hi)', label: 'your committed level', shape: 'dot' },
            { color: 'var(--bad)', label: 'committing this much costs more than committing nothing', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <ChipButton key={id} tone="info" on={presetId === id} onClick={() => load(PRESETS[id].profile)}>{PRESETS[id].label}</ChipButton>
          ))}
        </>,
        <>
          <Slider label="Edit hour" value={hour} min={0} max={HOURS - 1} format={(v) => `${v}:00`} onChange={setHour} />
          <Slider label="Requests/s that hour" value={profile[hour]} min={RPS_LIMITS.min} max={RPS_LIMITS.max} step={50} format={(v) => `${v}/s`} onChange={setRps} />
        </>,
        <>
          <BoundedIntField label="Committed instances" value={committed} min={0} max={peak} onValue={setCommitted} />
          <Slider label="Committed" value={committed} min={0} max={peak} onChange={setCommitted} />
          <Segmented label="Burst work" value={work} onChange={chooseWork} options={WORKS} />
          <ChipButton tone="violet" on={spot} onStyle="solid" softDisabled={reason !== null} ariaDescribedBy={reason !== null ? SPOT_NOTE_ID : undefined} onClick={() => { if (reason === null) setSpot(!spot); }}>run the burst on interruptible capacity</ChipButton>
        </>,
      ]}
    >
      <div className="fin-stage stage-pad">
        <WideRegion minWidth={420} label="The 24-hour profile: scroll sideways to see all of it">
          <Hours profile={profile} committed={committed} spot={spot} />
        </WideRegion>
        <Hint id={SPOT_NOTE_ID} tone={reason ? 'muted' : 'faint'} className="fin-note">
          {reason ?? 'Interruptible capacity is cheaper per hour but can be reclaimed, so a lost hour is redone: the page prices a useful hour at the interruptible price over (1 minus the interruption chance).'}
        </Hint>
        <figure className="fin-figure">
          <figcaption>Illustrative cost per day against committed instances: the cheapest level is {best}, and the dashed line is the cost of committing nothing</figcaption>
          <Plot2D x={{ domain: [0, Math.max(1, peak)], label: 'committed instances', ticks: Math.min(8, Math.max(1, peak)) }} y={{ domain: [0, top], label: 'cost per day', ticks: 4 }} width={356} height={200} ariaLabel={`Cost per day against committed instances: ${dollars(here.total)} at ${committed}, cheapest at ${best}`}>
            <Band lo={none} hi={overCommit} tone="bad" />
            <HLine at={none} tone="bad" label="commit nothing" />
            <Curve points={curve} tone="info" />
            <Points data={[{ x: best, y: dayCost(profile, best, spot).total, tone: 'ok' }, { x: committed, y: here.total, tone: 'hi' }]} r={5} />
          </Plot2D>
        </figure>
        <Hint tone="muted" className="fin-note">
          Each instance serves {CAPACITY_RPS} requests per second. A committed instance costs {dollars(P_C)} for all {HOURS} hours whether used or not; on demand costs {dollars(P_OD)} per hour used. {commitRule(spot)}
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">every price and capacity is a round number for the page, not any provider&apos;s price; change the numbers and the shape stays</Provenance>
          <Provenance kind="from-memory">commitment programmes trade flexibility for a lower price, and interruptible capacity can be reclaimed at short notice: both are general behaviour named from memory, to verify against your provider&apos;s documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
