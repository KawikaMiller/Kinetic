import { ROW_TOLERANCE, rowSum, type Matrix } from './model';
import { prob } from './text';

/** The transition matrix: every row, from a state to each next state, with its sum (exactly 1 once rescaled). The row being edited is tinted. */
export function MatrixTable({ states, P, row }: { states: readonly string[]; P: Matrix; row: number }) {
  return (
    <table className="mc-matrix" aria-label="Transition matrix, each row from a state">
      <thead>
        <tr>
          <th scope="col">from \ to</th>
          {states.map((s) => (
            <th key={s} scope="col">{s}</th>
          ))}
          <th scope="col">sum</th>
        </tr>
      </thead>
      <tbody>
        {P.map((r, i) => (
          <tr key={states[i]} className={i === row ? 'is-row' : undefined}>
            <th scope="row">{states[i]}</th>
            {r.map((p, j) => (
              <td key={states[j]}>{prob(p)}</td>
            ))}
            <td className="mc-sum">{Math.abs(rowSum(r) - 1) <= ROW_TOLERANCE ? '1' : prob(rowSum(r))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
