import { Box } from '../../components/Panel';
import type { Tone } from '../../core/tone';
import { badge, type LicenceId } from './licences';
import type { Compat, ObligationRow } from './resolver';

/** The one place the lesson says what it is. Shown in every scene. */
export function Disclaimer() {
  return (
    <Box variant="sunken" className="sl-disclaimer" role="note" aria-label="Not legal advice">
      <b>Educational summary, not legal advice.</b> Real compliance depends on the exact licence version, how the code is
      combined, dual-licensing, contributor agreements and your company's policy. Your lawyers decide.
    </Box>
  );
}

/** A licence badge: the SPDX identifier as text, so colour is never the only signal. */
export function LicenceBadge({ id, tone }: { id: LicenceId; tone?: Tone }) {
  return <span className={`chip sl-badge tone-${tone ?? (id === 'none' ? 'bad' : 'muted')}`}>{badge(id)}</span>;
}

const COMPAT_TONE: Record<Compat, Tone> = { fine: 'ok', 'whole-copyleft': 'violet', conflict: 'bad', 'no-permission': 'bad' };
const COMPAT_WORD: Record<Compat, string> = {
  fine: 'fine',
  'whole-copyleft': 'whole under its terms',
  conflict: 'conflict',
  'no-permission': 'no permission',
};

export function CompatChip({ compat }: { compat: Compat }) {
  return <span className={`chip sl-compat tone-${COMPAT_TONE[compat]}`}>{COMPAT_WORD[compat]}</span>;
}

const rowTone = (o: ObligationRow): Tone => (o.id === 'no-permission' ? 'bad' : o.copyleft ? 'violet' : 'ok');
const stateWord = (o: ObligationRow) => (o.state === 'due' ? 'due' : o.state === 'info' ? 'applies' : 'not triggered');

/** The obligations of one dependency: what the rule table says, in this setup. */
export function ObligationTable({ rows }: { rows: readonly ObligationRow[] }) {
  return (
    <table className="data-table sl-obl">
      <thead>
        <tr>
          <th>Obligation</th>
          <th>Here</th>
          <th>Where it comes from</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} className={`sl-obl-row is-${o.state}`}>
            <td>
              <b>{o.label}</b>
              <span className="sl-obl-detail">{o.detail}</span>
            </td>
            <td>
              <span className={`chip tone-${o.state === 'due' ? rowTone(o) : o.state === 'info' ? 'info' : 'dim'}`}>{stateWord(o)}</span>
            </td>
            <td className="sl-source">{o.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
