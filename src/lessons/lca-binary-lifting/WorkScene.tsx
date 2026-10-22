import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { PATH_SIZES, pathStats, type PathSize } from './model';

const SIZE_OPTIONS = PATH_SIZES.map((n) => ({ value: n, label: `${n.toLocaleString('en-US')} nodes` }));

/** Scene 4: lca(deepest, root) on a path, the worst case for the walk: real runs of the lifting against n - 1 parent steps. */
export function WorkScene({ picker }: { picker: ReactNode }) {
  const [size, setSize] = useState<PathSize>(256);
  const all = useMemo(() => PATH_SIZES.map((n) => pathStats(n)), []);
  const here = all[PATH_SIZES.indexOf(size)];

  return (
    <StageFrame
      height={420}
      intro={
        <>
          On a path of {here.n.toLocaleString('en-US')} nodes, the lowest common ancestor of the deepest node and the root takes {here.jumps} jumps by lifting against {here.steps.toLocaleString('en-US')} parent steps by walking.
          The table that makes this possible holds {here.entries.toLocaleString('en-US')} entries.
        </>
      }
      introKey={`work|${size}`}
      stats={
        <Stats>
          <Stat label="Jumps" value={here.jumps} color="var(--ok)" sub={`the binary digits of ${here.n - 1} that are 1`} />
          <Stat label="Parent steps" value={here.steps.toLocaleString('en-US')} color="var(--bad)" sub={`n - 1 for n = ${here.n.toLocaleString('en-US')}`} />
          <Stat label="Levels" value={here.levels} color="var(--info)" sub={`ceil(log2 ${here.n.toLocaleString('en-US')})`} />
          <Stat label="Table entries" value={here.entries.toLocaleString('en-US')} color="var(--violet)" sub={`${here.n.toLocaleString('en-US')} x ${here.levels}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'jumps (binary lifting)', shape: 'square' },
            { color: 'var(--bad)', label: 'parent steps (the naive walk)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Path of" value={size} onChange={setSize} options={SIZE_OPTIONS} />
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-bars">
          <Bar value={here.jumps} max={here.steps} tone="ok" label="Jumps" trailing={here.jumps} />
          <Bar value={here.steps} max={here.steps} tone="bad" label="Parent steps" trailing={here.steps.toLocaleString('en-US')} />
        </div>
        <table className="lc-table">
          <caption className="lc-caption">Real runs of lca(deepest, root) on a path, for each size</caption>
          <thead>
            <tr><th scope="col">n</th><th scope="col">levels</th><th scope="col">jumps</th><th scope="col">parent steps</th><th scope="col">table entries</th></tr>
          </thead>
          <tbody>
            {all.map((s) => (
              <tr key={s.n} className={s.n === size ? 'is-now' : ''}>
                <td>{s.n.toLocaleString('en-US')}</td>
                <td>{s.levels}</td>
                <td>{s.jumps}</td>
                <td>{s.steps.toLocaleString('en-US')}</td>
                <td>{s.entries.toLocaleString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lc-note">
          The lift here is the whole job: the depth gap n - 1 is written in binary and each 1 digit is one jump, so the count is the number of 1 digits.
          The price is the table: n x log2 n entries, built once, which is why lifting pays off when there are many queries.
          Commit graphs in version control are directed acyclic graphs, not trees (a merge commit has two parents), so this exact table does not apply to them.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: each count is from running the algorithm and the walk on a real path</Provenance>
        <Provenance kind="from-memory">uses such as file-system trees, org charts and phylogenies: verify against a textbook treatment of lowest common ancestors</Provenance>
        <ClaimLabel kind="standard">O(n log n) space, O(log n) per query: here read off the levels and jumps above</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
