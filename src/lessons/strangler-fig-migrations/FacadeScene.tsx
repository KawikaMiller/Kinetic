import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { integer, plural } from '../../core/format';
import { facadeCaption, lossText, rateText } from './captions';
import {
  BASE_DEFECT_PERMILLE, DEFECT_PER_TABLE_PERMILLE, MINUTES, REQ_PER_MIN, MODES, ROUTES, SHARES, defectPermille, observeCached, ownsData, readout, requestsPerMin, rollBack,
  routeOf, setDualWrite, setMinutes, setMode, setSeed, setShare, simKey, type Facade, type Mode, type Share,
} from './model';
import { OPENING } from './opening';

const shareOptions = SHARES.map((s) => ({ value: s, label: `${s}%` }));
const modeOptions = MODES.map((m) => ({ value: m.id, label: m.label }));

/** Scene 1: the route table behind the facade. Every control feeds a figure that is on screen. */
export function FacadeScene({ picker }: { picker: ReactNode }) {
  const [f, setF] = useState<Facade>(OPENING.facade);
  const r = readout(f);
  const o = observeCached(f);
  const newStack = Math.round(r.servedShare * 100);
  const key = simKey(f);

  return (
    <StageFrame
      height={760}
      intro={facadeCaption(f, r, o)}
      introKey={`${key}|${f.minutes}|${JSON.stringify(ROUTES.map((x) => f.settings[x.id].dualWrite))}`}
      stats={
        <Stats>
          <Stat label="User-visible error rate" value={rateText(r.errorRate)} color={r.errorRate > 0 ? 'var(--hi)' : undefined} sub={[`expected, from the routes served`, `seeded run: ${rateText(o.errorRate)} over ${o.minutes} minutes`]} />
          <Stat
            label="Shadow mismatch"
            value={r.mirroredPerMin > 0 ? `${integer(Math.round(r.mismatchPerMin))} a minute` : '–'}
            color={r.mirroredPerMin > 0 ? 'var(--violet)' : undefined}
            sub={r.mirroredPerMin > 0 ? [`${rateText(r.mismatchRate ?? 0)} of ${integer(r.mirroredPerMin)} mirrored requests`, `seeded run: ${integer(Math.round(o.mismatchPerMin))} a minute`] : 'no route is in Shadow'}
          />
          <Stat label="Traffic on the new stack" value={`${Math.round((r.servedShare + r.mirroredShare) * 100)}%`} color="var(--info)" sub={`${newStack}% served, ${Math.round(r.mirroredShare * 100)}% mirrored`} />
          <Stat label="Writes lost on rollback" value={integer(r.lostTotal)} color={r.lostTotal > 0 ? 'var(--bad)' : 'var(--ok)'} sub="routed share x writes a minute x minutes since cutover, dual-write off" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--info)', label: 'answered by the new stack' }, { color: 'var(--dim)', label: 'answered by the monolith' }, { color: 'var(--violet)', label: 'shadow: mirrored, users still see the monolith' }, { color: 'var(--bad)', label: 'writes lost on a rollback' }]} />}
      controls={[
        <>
          {picker}
          <SeedField seed={f.seed} onSeed={(seed) => setF((x) => setSeed(x, seed))} />
        </>,
        <>
          <Slider label="Minutes since cutover" value={f.minutes} {...MINUTES} onChange={(v) => setF((x) => setMinutes(x, v))} format={(v) => `${v} min`} />
        </>,
      ]}
    >
      <div className="sf-stage stage-pad">
        <div className="sf-split" role="img" aria-label={`${newStack}% of requests answered by the new stack, ${100 - newStack}% by the monolith`}>
          <span className="sf-split-new" style={{ width: `${newStack}%` }} />
        </div>
        <p className="sf-rule">
          Invented rule: a new route answers differently from the monolith on {BASE_DEFECT_PERMILLE / 10}% of requests plus {DEFECT_PER_TABLE_PERMILLE / 10}% for each shared table it touches, out of {integer(REQ_PER_MIN)} requests a minute.
        </p>
        {r.lost.map((l) => <p key={l.route} className="sf-banner" role="status">{lossText(routeOf(l.route).label, l.lost)}</p>)}
        {f.notice && <p className="sf-notice" role="status">{`Rolled back ${routeOf(f.notice.route).label}: ${integer(f.notice.lost)} writes were left only in the new store.`}</p>}
        <ul className="sf-routes">
          {ROUTES.map((route) => {
            const s = f.settings[route.id];
            return (
              <li key={route.id} className="sf-route">
                <div className="sf-route-head">
                  <b>{route.label}</b>
                  <span>{route.traffic}% of traffic ({integer(requestsPerMin(route))} a minute), {plural(route.coupling, "shared table")}, defect {rateText(defectPermille(route) / 1000)}, {route.note}{ownsData(route) ? `, ${route.writesPerMin} writes a minute` : ''}</span>
                </div>
                <div className="sf-route-controls">
                  <Segmented ariaLabel={`${route.label} mode`} value={s.mode} options={modeOptions} onChange={(m: Mode) => setF((x) => setMode(x, route.id, m))} />
                  {s.mode === 'serve' && <Segmented ariaLabel={`${route.label} routed share`} value={s.share} options={shareOptions} onChange={(v: Share) => setF((x) => setShare(x, route.id, v))} />}
                  {ownsData(route) && <Toggle label="Dual-write" value={s.dualWrite} onChange={(v) => setF((x) => setDualWrite(x, route.id, v))} />}
                  <Button softDisabled={s.mode === 'off'} onClick={() => setF((x) => rollBack(x, route.id))}>Roll back</Button>
                </div>
              </li>
            );
          })}
        </ul>
        <ProvenanceRow>
          <Provenance kind="invented">Acme Retail, its routes, defect rates and writes are made up</Provenance>
          <Provenance kind="illustrative">the route table</Provenance>
          <Provenance kind="simulated" seed={f.seed}>one tick a minute for {o.minutes} minutes</Provenance>
          <ClaimLabel kind="practice">dual-writing during a migration is a common way to keep a rollback possible, and it has a maintenance cost that this page does not price</ClaimLabel>
          <ClaimLabel kind="practice">routing through a facade and shadowing traffic are common ways to compare a new route with the old one</ClaimLabel>
          <Provenance kind="from-memory">the name &quot;strangler fig&quot; is credited to Martin Fowler&apos;s 2004 write-up; verify against his bliki entry on the strangler fig application</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
