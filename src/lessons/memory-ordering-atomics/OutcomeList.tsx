import { ChipButton } from '../../components/ui';
import { rowNote, type Row, type Table } from './model';

/** One card per possible outcome: reachable ones with a "show it" button, the rest dimmed with why. */
export function OutcomeList({ t, shown, onShow }: { t: Table; shown: string | null; onShow: (regsKey: string) => void }) {
  return (
    <ul className="moa-outcomes" aria-label="Outcomes allowed by the model">
      {t.rows.map((r: Row) => (
        <li key={r.regsKey} className={`moa-outcome${r.reachable ? (r.viaRelaxation ? ' is-relaxed' : ' is-plain') : ' is-no'}`}>
          <div className="moa-out-head">
            <b className="mono">{r.label}</b>
            {r.isTarget && <span className="chip moa-target">the surprising one</span>}
          </div>
          <div className="moa-out-note">{rowNote(r, t)}</div>
          {r.reachable && (
            <ChipButton tone="info" size="sm" on={shown === r.regsKey} ariaLabel={`Show the shortest schedule that ends with ${r.label}`} onClick={() => onShow(r.regsKey)}>
              show it
            </ChipButton>
          )}
        </li>
      ))}
    </ul>
  );
}
