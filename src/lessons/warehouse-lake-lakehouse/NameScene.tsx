import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { KINDS, capabilityTable, type Kind } from './capabilities';
import { nameCaption } from './captions';
import { leaders, scores } from './facts';
import { ALL_NEEDS, initialNameScene, type NeedId } from './init';

const KIND_TONE: Record<Kind, string> = { warehouse: 'amber', lake: 'pink', lakehouse: 'sky' };
const DEFINITIONS: Record<Kind, string> = {
  warehouse: 'A managed analytical database: it owns the storage, enforces a schema, lays data out by column and runs the queries.',
  lake: 'Raw files in object storage, in whatever format they arrived: cheap to fill, with no schema or transactions of its own.',
  lakehouse: 'A lake with a table format over open columnar files, so it gets schemas, snapshots and transactions without owning the storage.',
};

export function NameScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialNameScene);
  const { needs } = state;

  const table = useMemo(() => capabilityTable(), []);
  const score = scores(needs);
  const top = leaders(needs);

  useIntroCaption(nameCaption(top, score, needs.length), [needs]);

  const toggle = (id: NeedId) => setState((s) => ({ needs: s.needs.includes(id) ? s.needs.filter((n) => n !== id) : ALL_NEEDS.filter((n) => n === id || s.needs.includes(n)) }));

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          {KINDS.map((k) => (
            <Stat key={k} label={k} value={`${score[k]} of ${needs.length}`} color={needs.length > 0 && top.includes(k) ? 'var(--ok)' : undefined} sub="chosen properties it has" />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a property the architecture has (cheap, safe or fast side)', shape: 'square' },
            { color: 'var(--bad)', label: 'a property it lacks (the costly side)', shape: 'square' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          {table.map((row) => (
            <ChipButton key={row.id} tone="info" on={needs.includes(row.id)} onClick={() => toggle(row.id)}>{row.label}</ChipButton>
          ))}
        </>
      }
    >
      <div className="wl-stage stage-pad">
        <Box>
          <SectionTitle hint="each cell is computed from the models of the earlier scenes">Three architectures</SectionTitle>
          <div className="wl-scroll wl-tall" role="region" aria-label="Warehouse, lake and lakehouse compared on five properties" tabIndex={0}>
            <table className="data-table wl-table wl-compare">
              <thead>
                <tr>
                  <th scope="col">Property</th>
                  {KINDS.map((k) => (
                    <th key={k} scope="col"><span className={`wl-tag tone-${KIND_TONE[k]}`}>{k}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((row) => (
                  <tr key={row.id} className={needs.includes(row.id) ? '' : 'wl-off'}>
                    <th scope="row">{row.label}</th>
                    {KINDS.map((k) => (
                      <td key={k} className={row.cells[k].verdict === 'good' ? 'wl-ok' : 'wl-bad'}>
                        {row.cells[k].verdict === 'good' ? '✓' : '✗'} {row.cells[k].text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint="the words overlap in practice">What the names mean</SectionTitle>
          <ul className="wl-defs">
            {KINDS.map((k) => (
              <li key={k}>
                <span className={`wl-tag tone-${KIND_TONE[k]}`}>{k}</span> {DEFINITIONS[k]} <ClaimLabel kind="view">one common usage</ClaimLabel>
              </li>
            ))}
          </ul>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">storage prices are made-up round numbers; the scan cost and the tears come from this lesson&rsquo;s own models</Provenance>
          <Provenance kind="toy">three idealised architectures: real products blur them, and a cloud warehouse can also read open files</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
