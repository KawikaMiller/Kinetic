import { ChipButton } from '../../components/ui';
import { ACM_ATTRIBUTION, principle, type PrincipleId } from './acm';

/** ACM principle chips: press one to open the Code's heading and a one-line paraphrase. */
export function PrincipleChips({ ids, open, onToggle }: { ids: readonly PrincipleId[]; open: PrincipleId | null; onToggle: (id: PrincipleId) => void }) {
  return (
    <div className="ce-principles">
      <div className="ce-chip-row">
        {ids.map((id) => (
          <ChipButton key={id} tone="violet" on={open === id} onClick={() => onToggle(id)} ariaLabel={`ACM ${id}: ${principle(id).short}. Show the one-line summary`}>
            {id} {principle(id).short}
          </ChipButton>
        ))}
      </div>
      {open && ids.includes(open) && (
        <div className="ce-principle-open" role="note">
          <b>
            ACM {open}: {principle(open).title}
          </b>
          <span>Paraphrase: {principle(open).gist}</span>
          <span className="ce-source">{ACM_ATTRIBUTION}</span>
        </div>
      )}
    </div>
  );
}
