import { CUSTOMERS, type Dashboard, type Strategy, type World } from './shop';

type Tone = 'ok' | 'bad' | 'info' | 'hi';

function toneOf(strategy: Strategy, differs: boolean, written: boolean): Tone {
  if (differs) return 'bad';
  if (written) return 'hi';
  return strategy === 'live' ? 'ok' : 'info';
}

const cellText = (v: number | null): string => (v === null ? 'none' : String(v));

/**
 * What the dashboard shows, row by row. A row that differs from the live query is red with the live value beside it,
 * the row the last write changed is yellow, an answer computed live is green and one read from precomputed data is blue.
 */
export function DashboardTable({ world, shown, live, strategy, changed, refreshed }: {
  world: World;
  shown: Dashboard;
  live: Dashboard;
  strategy: Strategy;
  changed: ReadonlySet<string>;
  refreshed: boolean;
}) {
  const names = [...new Set([...Object.keys(shown.units), ...Object.keys(live.units)])];
  const renamedAway = (n: string) => !world.products.some((p) => p.name === n);
  return (
    <div className="mv-dash">
      <table className="data-table mv-dash-table" aria-label="Revenue per customer">
        <thead><tr><th>Customer</th><th>Revenue</th></tr></thead>
        <tbody>
          {CUSTOMERS.map((name, i) => {
            const id = i + 1;
            const differs = shown.revenue[id] !== live.revenue[id];
            const tone = toneOf(strategy, differs, changed.has(`revenue:${id}`));
            return (
              <tr key={name} className={`is-${tone}`}>
                <td>{name}</td>
                <td>{shown.revenue[id]}{differs && <span className="mv-live"> (live: {live.revenue[id]})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="data-table mv-dash-table" aria-label="Units per product">
        <thead><tr><th>Product</th><th>Units</th></tr></thead>
        <tbody>
          {names.map((n) => {
            const a = shown.units[n] ?? null;
            const b = live.units[n] ?? null;
            const tone = toneOf(strategy, a !== b, changed.has(`units:${n}`));
            return (
              <tr key={n} className={`is-${tone}`}>
                <td>{n}{strategy === 'copy' && renamedAway(n) ? ' (old name)' : ''}</td>
                <td>{cellText(a)}{a !== b && <span className="mv-live"> (live: {cellText(b)})</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {refreshed && <p className="mv-refresh">The view was just rebuilt from the tables.</p>}
    </div>
  );
}
