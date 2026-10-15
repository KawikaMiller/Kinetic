import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { matrixCaption } from './captions';
import { RANGES } from './generator';
import { MATRIX_CASES, MATRIX_CONFIG, buildMatrix, survivors } from './matrix';
import { BUGS, PROPERTIES, type PropId } from './sorts';

const MATRIX_MIN_WIDTH = 440;
const OPENING_SUITE: PropId[] = ['sameLength'];

export function MatrixScene({ picker }: { picker: ReactNode }) {
  const [suite, setSuite] = useState<PropId[]>(OPENING_SUITE);
  const matrix = useMemo(() => buildMatrix(), []);
  const setCaption = useSetCaption();
  const alive = survivors(matrix, suite);
  const buggy = BUGS.filter((b) => b.id !== 'correct');

  useEffect(() => {
    setCaption(matrixCaption(matrix, suite), { quiet: true });
  }, [setCaption, matrix, suite]);

  const toggle = (id: PropId) => setSuite(suite.includes(id) ? suite.filter((p) => p !== id) : [...suite, id]);
  const range = RANGES.find((r) => r.id === MATRIX_CONFIG.range)!.label;

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Your suite" value={suite.length} sub="properties ticked" />
          <Stat label="Bugs caught" value={`${buggy.length - alive.length} of ${buggy.length}`} color={alive.length ? 'var(--orange)' : 'var(--ok)'} />
          <Stat label="Survivors" value={alive.length} color={alive.length ? 'var(--orange)' : 'var(--muted)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'caught, with the first case that did', shape: 'square' },
            { color: 'var(--orange)', label: 'not caught in 500 cases: not the same as correct', shape: 'square' },
            { color: 'var(--muted)', label: 'the correct sort: no failure found', shape: 'square' },
            { color: 'var(--violet)', label: 'property in your suite', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Your suite">
            {PROPERTIES.map((p) => (
              <ChipButton key={p.id} tone="violet" on={suite.includes(p.id)} onClick={() => toggle(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="pbt stage-pad">
        <WideRegion minWidth={MATRIX_MIN_WIDTH} label="Bug by property matrix: scroll sideways to see all of it">
          <table className="data-table pbt-matrix">
            <thead>
              <tr>
                <th>Function</th>
                {PROPERTIES.map((p) => (
                  <th key={p.id} className={suite.includes(p.id) ? 'is-suite' : ''}>
                    {p.label}
                  </th>
                ))}
                <th>Your suite</th>
              </tr>
            </thead>
            <tbody>
              {BUGS.map((b) => {
                const isCorrect = b.id === 'correct';
                const cells = PROPERTIES.map((p) => matrix.find((c) => c.bug === b.id && c.prop === p.id)!);
                const survives = alive.includes(b.id);
                return (
                  <tr key={b.id}>
                    <th scope="row">{b.label}</th>
                    {cells.map((c) => (
                      <td key={c.prop} className={`pbt-cell ${isCorrect ? 'is-control' : c.firstAt === null ? 'is-missed' : 'is-caught'}`}>
                        {isCorrect ? `passes ${MATRIX_CASES}` : c.firstAt === null ? '✗ not caught' : `✓ case ${c.firstAt}`}
                      </td>
                    ))}
                    <td className={`pbt-cell ${isCorrect ? 'is-control' : survives ? 'is-missed' : 'is-caught'}`}>
                      {isCorrect ? 'no failure found' : survives ? 'survives' : 'caught'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <div className="pbt-notes">
          <Provenance kind="real" seed={MATRIX_CONFIG.seed}>every cell really ran {MATRIX_CASES} cases of one property: values {range}, up to {MATRIX_CONFIG.maxLength} per array</Provenance>
          <Hint block>No failure found is not a proof: a cell can only say that these {MATRIX_CASES} inputs did not break it.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
