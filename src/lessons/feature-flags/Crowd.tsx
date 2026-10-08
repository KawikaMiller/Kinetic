import { CellGrid } from '../../components/CellGrid';
import { GRID_COLS, USER_COUNT, bucketOf, FLAG_KEY, type User } from './model';

/** The 400 users as a 20 x 20 crowd: violet sees the new checkout, blue the old one (categories, not good and bad). */
export function Crowd({
  users, isOn, selected, onSelect,
}: {
  users: readonly User[];
  isOn: (u: User) => boolean;
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  const rows = USER_COUNT / GRID_COLS;
  const at = (r: number, c: number) => users[r * GRID_COLS + c];
  return (
    <CellGrid
      rows={rows}
      cols={GRID_COLS}
      size="xs"
      cell={(r, c) => (isOn(at(r, c)) ? { tone: 'violet', fill: 'solid' } : { tone: 'info', fill: 'tint' })}
      cellTitle={(r, c) => `${at(r, c).id}: ${at(r, c).country}${at(r, c).staff ? ', staff' : ''}, bucket ${bucketOf(FLAG_KEY, at(r, c).id)}, sees the ${isOn(at(r, c)) ? 'new' : 'old'} checkout`}
      cellAriaLabel={(r, c) => `${at(r, c).id}, ${isOn(at(r, c)) ? 'new' : 'old'} checkout`}
      onCellClick={onSelect ? (r, c) => onSelect(r * GRID_COLS + c) : undefined}
      highlight={selected === undefined ? [] : [{ r: Math.floor(selected / GRID_COLS), c: selected % GRID_COLS, tone: 'hi' }]}
      ariaLabel={`${USER_COUNT} users`}
    />
  );
}
