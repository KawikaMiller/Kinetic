import { ChipButton, Segmented, TextField } from '../../components/ui';
import { PRESETS, SIZE_MAX, SIZE_MIN, colsOf, rowsOf, type Game } from './model';
import type { GameState } from './useGame';

const SIZE_OPTIONS = Array.from({ length: SIZE_MAX - SIZE_MIN + 1 }, (_, i) => ({ value: SIZE_MIN + i, label: String(SIZE_MIN + i) }));
const FIELD_PX = 56;

const sameGame = (a: Game, b: Game) => JSON.stringify([a.A, a.B]) === JSON.stringify([b.A, b.B]);

/** The preset chips, the size pickers (when `resizable`) and one number field per payoff. */
export function PayoffControls({ state, resizable = true }: { state: GameState; resizable?: boolean }) {
  return (
    <>
      {PRESETS.map((p) => (
        <ChipButton key={p.id} tone="violet" on={sameGame(state.game, p.game)} onClick={() => state.load(p.game)}>{p.label}</ChipButton>
      ))}
      {resizable && (
        <>
          <Segmented label="Row strategies" value={rowsOf(state.game)} onChange={(rows) => state.resize(rows, colsOf(state.game))} options={SIZE_OPTIONS} />
          <Segmented label="Column strategies" value={colsOf(state.game)} onChange={(cols) => state.resize(rowsOf(state.game), cols)} options={SIZE_OPTIONS} />
        </>
      )}
    </>
  );
}

/** One pair of number fields per cell: Row's payoff then Column's. */
export function PayoffFields({ state }: { state: GameState }) {
  const { game } = state;
  return (
    <div className="gt-fields" role="group" aria-label="Edit the payoffs: Row's payoff, then Column's, for each cell">
      {game.A.map((line, r) => (
        <div key={r} className="gt-field-row">
          {line.map((_, c) => (
            <span key={c} className="gt-field-cell">
              {(['A', 'B'] as const).map((who) => {
                const matrix = who === 'A' ? game.A : game.B;
                return (
                  <TextField
                    key={who}
                    value={state.drafts[state.fieldKey(who, r, c)] ?? String(matrix[r][c])}
                    onChange={(text) => state.edit(who, r, c, text)}
                    onBlur={() => state.settle(who, r, c)}
                    width={FIELD_PX}
                    spellCheck={false}
                    ariaLabel={`${who === 'A' ? 'Row' : 'Column'} payoff when Row plays ${game.rowNames[r]} and Column plays ${game.colNames[c]}`}
                  />
                );
              })}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
