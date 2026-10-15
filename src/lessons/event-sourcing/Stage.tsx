import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { useInterval } from '../../core/useInterval';
import { appendedCaption, introCaption, money, newProjectionCaption, rejectedCaption, resetCaption, scrubCaption } from './captions';
import { bigWithdrawals, dateOf, fold, SEED, statement, type AccountEvent, type EventType, type Projection } from './events';
import {
  addBigProjection, DEPOSIT, hasBigProjection, initialSim, isBehind, lagOf, runCommand, tick, WITHDRAW, WITHDRAW_TOO_MUCH, type Sim,
} from './model';
import './styles.css';

/** Event colours: plain categories, so categorical tones rather than the ok/bad meanings. */
const TYPE_TONE: Record<EventType, string> = { AccountOpened: 'tone-sky', Deposited: 'tone-amber', Withdrew: 'tone-orange' };

/** Projections advance one step per tick. */
const TICK_MS = 150;

export function Stage() {
  const setCaption = useSetCaption();
  const [sim, setSim] = useState<Sim>(initialSim);
  const [cursor, setCursor] = useState<number | null>(null); // null = live
  const [rejected, setRejected] = useState(0);
  const { events, projections } = sim;

  useInterval(() => setSim(tick), TICK_MS, isBehind(sim));

  useIntroCaption(introCaption());

  const live = fold(events);
  const at = cursor ?? events.length;
  const past = fold(events, at);
  const lag = lagOf(sim);

  const command = (type: 'Deposited' | 'Withdrew', amount: number) => {
    const result = runCommand(sim, type, amount);
    if (!result.ok) {
      setRejected((r) => r + 1);
      setCaption(rejectedCaption(amount, result.balance));
      return;
    }
    setSim(result.sim);
    setCursor(null);
    setCaption(appendedCaption(result.event));
  };

  const addProjection = () => {
    setSim(addBigProjection);
    setCaption(newProjectionCaption());
  };

  const scrub = (v: number) => {
    setCursor(v >= events.length ? null : v);
    setCaption(scrubCaption(events, v, fold(events, v).balance), { quiet: true });
  };

  const reset = () => {
    setSim(initialSim());
    setCursor(null);
    setRejected(0);
    setCaption(resetCaption(SEED.length));
  };

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Events stored" value={events.length} sub="never edited or deleted" />
          <Stat label="Balance" value={money(live.balance)} sub="fold(events)" />
          <Stat label="Read-model lag" value={lag} color={lag ? 'var(--hi)' : 'var(--ok)'} sub={lag ? 'events behind' : 'caught up'} />
          <Stat label="Rejected commands" value={rejected} color={rejected ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <>
          <Legend
            items={[
              { color: 'var(--sky)', label: 'AccountOpened' },
              { color: 'var(--amber)', label: 'Deposited' },
              { color: 'var(--orange)', label: 'Withdrew' },
              ...projections.map((p) => ({ color: p.color, label: `${p.name} position`, shape: 'dot' as const })),
              { color: 'var(--hi)', label: 'time-travel cursor', shape: 'line' as const },
            ]}
          />
          <div className="es-prov">
            <Provenance kind="toy">one invented bank account; the dates are days of a year with 28 days in February</Provenance>
            <Provenance kind="illustrative">the read models' lag ({projections[0].delay} and {projections[1].delay} ticks per event) is set to be visible, not measured</Provenance>
          </div>
        </>
      }
      controls={
        <Controls>
          <Button variant="primary" onClick={() => command('Deposited', DEPOSIT)}>
            {`Deposit ${money(DEPOSIT)}`}
          </Button>
          <Button onClick={() => command('Withdrew', WITHDRAW)}>{`Withdraw ${money(WITHDRAW)}`}</Button>
          <Button variant="danger" onClick={() => command('Withdrew', WITHDRAW_TOO_MUCH)}>
            {`Withdraw ${money(WITHDRAW_TOO_MUCH)}`}
          </Button>
          <Button onClick={addProjection} disabled={hasBigProjection(sim)}>
            + New projection
          </Button>
          <Button onClick={reset}>Reset</Button>
        </Controls>
      }
    >
      <div className="es">
        {/* ── The log ─────────────────────────────── */}
        <section className="es-col">
          <h4>
            Event log <span>append-only</span>
          </h4>
          <ol className="es-log" tabIndex={0} aria-label="Event log (scrollable)">
            <AnimatePresence initial={false}>
              {events.map((e, i) => {
                const future = i >= at;
                const markers = projections.filter((p) => p.pos === i + 1);
                return (
                  <motion.li
                    key={e.seq}
                    layout
                    className={`es-ev ${TYPE_TONE[e.type]} ${future ? 'future' : ''}`}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: future ? 0.3 : 1, x: 0 }}
                    transition={SPRING.snappy}
                  >
                    <span className="es-seq">#{e.seq}</span>
                    <span className="es-type">{e.type}</span>
                    <span className="es-amt">{e.type === 'AccountOpened' ? e.owner : money(e.amount)}</span>
                    <span className="es-date">{dateOf(e.day).label}</span>
                    <span className={`es-v v${e.v}`} title={e.v === 1 ? 'v1 schema: upcast to EUR on read' : 'v2 schema: has currency'}>
                      v{e.v}
                    </span>
                    <span className="es-markers">
                      {markers.map((p) => (
                        <motion.i key={p.id} layoutId={`marker-${p.id}`} style={{ background: p.color }} title={`${p.name} is here`} />
                      ))}
                    </span>
                    {i === at - 1 && cursor !== null && <span className="es-cursor" />}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </section>

        {/* ── Fold ────────────────────────────────── */}
        <section className="es-col es-mid">
          <h4>
            Current state <span>= fold(events)</span>
          </h4>
          <div className={`es-state ${cursor !== null ? 'past' : ''}`}>
            <p className="es-owner">{past.owner ? `${past.owner}'s account` : 'no account yet'}</p>
            <motion.p key={past.balance} className="es-balance" initial={{ scale: 1.15, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>
              {money(past.balance)}
            </motion.p>
            <p className="es-applied">
              replayed events #1 → #{at}
              {cursor !== null && <b> · viewing the past</b>}
            </p>
          </div>
          <code className="es-code">state = events.reduce(apply, empty)</code>
          <div className="es-scrub">
            <Slider
              label="Time travel: rebuild state as of event"
              value={at}
              min={0}
              max={events.length}
              onChange={scrub}
              format={(v) => (v >= events.length ? `#${v} (now)` : `#${v}`)}
            />
          </div>
          <p className="es-note">
            <b>v1</b> events predate the currency field. They're <span className="hl">upcast</span> to EUR when read, never rewritten.
          </p>
        </section>

        {/* ── Read models ─────────────────────────── */}
        <section className="es-col">
          <h4>
            Read models <span>CQRS projections</span>
          </h4>
          <div className="es-projs">
            {projections.map((p) => (
              <ProjectionCard key={p.id} p={p} events={events} />
            ))}
          </div>
        </section>
      </div>
    </StageFrame>
  );
}

function ProjectionCard({ p, events }: { p: Projection; events: readonly AccountEvent[] }) {
  const lag = events.length - p.pos;
  return (
    <motion.article
      className="es-proj"
      style={{ ['--pc' as string]: p.color }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header>
        <i />
        <span>{p.name}</span>
        <em className={lag ? 'lag' : 'ok'}>{p.rebuilding ? `replaying ${p.pos}/${events.length}` : lag ? `${lag} behind` : 'up to date'}</em>
      </header>
      {p.id === 'balance' && <p className="es-proj-big">{money(fold(events, p.pos).balance)}</p>}
      {p.id === 'statement' && (
        <table className="es-table">
          <thead>
            <tr>
              <th>month</th>
              <th>in</th>
              <th>out</th>
            </tr>
          </thead>
          <tbody>
            {statement(events, p.pos).map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td className="in">{r.inflow ? `+${r.inflow}` : 0}</td>
                <td className="out">{r.outflow ? `−${r.outflow}` : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.id === 'big' && (
        <ul className="es-big">
          {bigWithdrawals(events, p.pos).map((e) => (
            <motion.li key={e.seq} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              #{e.seq} · {dateOf(e.day).label} · {money(e.amount)}
            </motion.li>
          ))}
          {bigWithdrawals(events, p.pos).length === 0 && <li className="muted">none yet</li>}
        </ul>
      )}
    </motion.article>
  );
}
