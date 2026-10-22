import { decimal } from '../../core/format';
import type { Mat4, Vec4 } from '../../core/raster3d';

const cell = (v: number) => decimal(v, 2);

/** `matrix × input = output`, every cell printed from the model. */
export function MatrixEquation({ name, matrix, input, output }: { name: string; matrix: Mat4; input: Vec4; output: Vec4 }) {
  const column = (v: Vec4, label: string) => (
    <div className="td-matrix td-vector" role="group" aria-label={label}>
      {v.map((x, i) => <span key={i}>{cell(x)}</span>)}
    </div>
  );
  return (
    <div className="td-eq">
      <div className="td-matrix" role="group" aria-label={`matrix ${name}`}>
        {matrix.flat().map((x, i) => <span key={i}>{cell(x)}</span>)}
      </div>
      <span className="td-op" aria-hidden="true">×</span>
      {column(input, 'input vector')}
      <span className="td-op" aria-hidden="true">=</span>
      {column(output, 'output vector')}
    </div>
  );
}
