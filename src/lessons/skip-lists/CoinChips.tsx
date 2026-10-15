import { Tray } from '../../components/Panel';

/** The coin flips of the insert in progress, in order: heads amber, tails pink (plain categories, never ok/bad). */
export function CoinChips({ coins }: { coins: readonly boolean[] }) {
  return (
    <Tray label="Coin flips for this insert" labelWeight="regular" empty="not flipped yet" ariaLabel="Coin flips">
      {coins.map((heads, i) => (
        <span key={i} className={`chip sl-coin ${heads ? 'tone-amber' : 'tone-pink'}`}>
          {heads ? 'H' : 'T'}
        </span>
      ))}
    </Tray>
  );
}
