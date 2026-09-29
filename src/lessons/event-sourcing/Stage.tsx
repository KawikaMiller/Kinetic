import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import {
  bigWithdrawals, dateOf, fold, SEED, statement,
  type AccountEvent, type EventType, type Projection,
} from './events';
import './styles.css';

const TYPE_CLASS: Record<EventType, string> = { AccountOpened: 'open', Deposited: 'dep', Withdrew: 'wd' };

const START_PROJECTIONS: Projection[] = [
  { id: 'balance', name: 'Balance view', color: '#a78bfa', pos: SEED.length, rebuilding: false, delay: 8, wait: 0 },
  { id: 'statement', name: 'Monthly statement', color: '#4cc9f0', pos: SEED.length, rebuilding: false, delay: 12, wait: 0 },
];
const BIG: Projection = { id: 'big', name: 'Big withdrawals ≥ 100', color: '#ff8c5a', pos: 0, rebuilding: true, delay: 8, wait: 0 };

interface Sim {
  events: AccountEvent[];
  projections: Projection[];
}

const money = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString()}`;

export function Stage() {
  const setCaption = useSetCaption();
  const [sim, setSim] = useState<Sim>({ events: SEED, projections: START_PROJECTIONS });
  const [cursor, setCursor] = useState<number | null>(null); // null = live
  const [rejected, setRejected] = useState(0);
  const { events, projections } = sim;

  // Projections consume the log asynchronously. Each normal one waits its own
  // `delay` ticks per event (that's the visible lag); a rebuilding one replays
  // history as fast as it can.
  const behind = projections.some((p) => p.pos < events.length);
  useEffect(() => {
    if (!behind) return;
    const id = setInterval(() => {
      setSim((s) => ({
        ...s,
        projections: s.projections.map((p) => {
          if (p.pos >= s.events.length) return p.rebuilding ? { ...p, rebuilding: false, wait: 0 } : p;
          if (p.rebuilding) return { ...p, pos: p.pos + 1 };
          if (p.wait + 1 < p.delay) return { ...p, wait: p.wait + 1 };
          return { ...p, pos: p.pos + 1, wait: 0 };
        }),
      }));
    }, 150);
    return () => clearInterval(id);
  }, [behind]);

  useEffect(() => {
    setCaption(
      <>
        Nothing is updated in place. Every change is an <span className="hl">event</span> appended to the log, and the balance is
        computed by <b>replaying</b> them.
      </>,
    );
  }, [setCaption]);

  const live = fold(events);
  const at = cursor ?? events.length;
  const past = fold(events, at);
  const lag = Math.max(...projections.map((p) => events.length - p.pos));

  const command = (type: 'Deposited' | 'Withdrew', amount: number) => {
    if (type === 'Withdrew' && amount > live.balance) {
      setRejected((r) => r + 1);
      setCaption(
        <>
          <span className="hl bad">Command rejected</span>: withdraw {money(amount)} with only {money(live.balance)}. No event is
          written; events record facts that <b>already happened</b>.
        </>,
      );
      return;
    }
    const last = events[events.length - 1];
    const e: AccountEvent = { seq: last.seq + 1, type, amount, day: Math.min(365, last.day + 5), v: 2, currency: 'EUR' };
    setSim((s) => ({ ...s, events: [...s.events, e] }));
    setCursor(null);
    setCaption(
      <>
        <span className={`hl ${type === 'Deposited' ? 'ok' : 'bad'}`}>
          {type} {money(amount)}
        </span>{' '}
        appended as event <b>#{e.seq}</b>. The write is done; read models <b>catch up a moment later</b> (eventual consistency).
      </>,
    );
  };

  const addProjection = () => {
    setSim((s) => ({ ...s, projections: [...s.projections, { ...BIG }] }));
    setCaption(
      <>
        A brand-new read model, built by <span className="hl violet">replaying all of history</span>. No migration, no backfill
        script: the log already has everything.
      </>,
    );
  };

  const scrub = (v: number) => {
    const c = v >= events.length ? null : v;
    setCursor(c);
    const s = fold(events, v);
    const e = events[v - 1];
    setCaption(
      c === null ? (
        <>Back to the present: {events.length} events, balance {money(s.balance)}.</>
      ) : (
        <>
          <span className="hl">Time travel</span>: state as of event #{v}
          {e ? ` (${dateOf(e.day).label})` : ''} = balance <b>{money(s.balance)}</b>. Nothing stored this; it's recomputed from the log.
        </>
      ),
    );
  };

  const reset = () => {
    setSim({ events: SEED, projections: START_PROJECTIONS });
    setCursor(null);
    setRejected(0);
    setCaption(<>Reset to the original seven events.</>);
  };

  const hasBig = projections.some((p) => p.id === 'big');

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Events stored" value={events.length} sub="never edited or deleted" />
          <Stat label="Balance" value={money(live.balance)} color="var(--ok)" sub="fold(events)" />
          <Stat label="Read-model lag" value={lag} color={lag ? 'var(--hi)' : 'var(--ok)'} sub={lag ? 'events behind' : 'caught up'} />
          <Stat label="Rejected commands" value={rejected} color={rejected ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'AccountOpened' },
            { color: 'var(--ok)', label: 'Deposited' },
            { color: 'var(--bad)', label: 'Withdrew' },
            { color: 'var(--violet)', label: 'projection position', shape: 'dot' },
            { color: 'var(--hi)', label: 'time-travel cursor', shape: 'line' },
          ]}
        />
      }
      controls={
        <Controls>
          <Button variant="primary" onClick={() => command('Deposited', 100)}>
            Deposit €100
          </Button>
          <Button onClick={() => command('Withdrew', 70)}>Withdraw €70</Button>
          <Button variant="danger" onClick={() => command('Withdrew', 5000)}>
            Withdraw €5,000
          </Button>
          <Button onClick={addProjection} disabled={hasBig}>
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
          <ol className="es-log">
            <AnimatePresence initial={false}>
              {events.map((e, i) => {
                const future = i >= at;
                const markers = projections.filter((p) => p.pos === i + 1);
                return (
                  <motion.li
                    key={e.seq}
                    layout
                    className={`es-ev ${TYPE_CLASS[e.type]} ${future ? 'future' : ''}`}
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: future ? 0.3 : 1, x: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
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

function ProjectionCard({ p, events }: { p: Projection; events: AccountEvent[] }) {
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
      {p.id === 'balance' && <p className="es-proj-big">€{fold(events, p.pos).balance.toLocaleString()}</p>}
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
                <td className="in">+{r.inflow}</td>
                <td className="out">−{r.outflow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.id === 'big' && (
        <ul className="es-big">
          {bigWithdrawals(events, p.pos).map((e) => (
            <motion.li key={e.seq} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              #{e.seq} · {dateOf(e.day).label} · €{e.amount}
            </motion.li>
          ))}
          {bigWithdrawals(events, p.pos).length === 0 && <li className="muted">none yet</li>}
        </ul>
      )}
    </motion.article>
  );
}
