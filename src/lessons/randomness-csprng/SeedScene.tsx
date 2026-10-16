import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { decimal, integer, power } from '../../core/format';
import { seedCaption } from './captions';
import { OPENING } from './opening';
import { COARSENESS, SYSTEM_SEED_BITS, WINDOWS, seedSpace, type Coarseness } from './recovery';

/** Scene 4: how many seeds an observer who knows roughly when a generator was seeded has to consider. */
export function SeedScene({ picker }: { picker: ReactNode }) {
  const [c, setC] = useState<Coarseness>(OPENING.seed.coarseness);
  const [windowId, setWindowId] = useState(OPENING.seed.window);
  const w = WINDOWS.find((x) => x.id === windowId)!;
  const mine = seedSpace(c, w.seconds);

  return (
    <StageFrame
      height={520}
      intro={seedCaption(c, windowId)}
      introKey={`${c}|${windowId}`}
      stats={
        <Stats>
          <Stat label="Seeds to consider" value={c === 'system' ? power(SYSTEM_SEED_BITS) : integer(mine.seeds)} color={mine.bits < 40 ? 'var(--bad)' : 'var(--ok)'} sub={`for a guess of ${w.label}`} />
          <Stat label="In bits" value={decimal(mine.bits, 1)} sub="log base 2 of the count">
            <Bar value={mine.bits} max={SYSTEM_SEED_BITS} tone={mine.bits < 40 ? 'bad' : 'ok'} ariaLabel={`${decimal(mine.bits, 1)} of ${SYSTEM_SEED_BITS} bits`} />
          </Stat>
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'a space a computer can search at once', shape: 'square' }, { color: 'var(--ok)', label: 'far beyond reach', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Where the seed comes from" value={c} options={COARSENESS.map((x) => ({ value: x.id, label: x.label }))} onChange={setC} />
          <Segmented label="Observer's guess of when" value={windowId} options={WINDOWS.map((x) => ({ value: x.id, label: x.label }))} onChange={setWindowId} />
        </>,
      ]}
    >
      <div className="rn-stage stage-pad">
        <Box className="rn-panel">
          <SectionTitle hint={`a guess of ${w.label}`}>All three, side by side</SectionTitle>
          <table className="data-table rn-table">
            <thead><tr><th>Seed source</th><th>Seeds</th><th>Bits</th></tr></thead>
            <tbody>
              {COARSENESS.map((x) => {
                const s = seedSpace(x.id, w.seconds);
                return (
                  <tr key={x.id} className={x.id === c ? 'rn-current' : undefined}>
                    <td>{x.label}</td>
                    <td>{x.id === 'system' ? power(SYSTEM_SEED_BITS) : integer(s.seeds)}</td>
                    <td>{decimal(s.bits, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
        <p className="rn-note">A long output from a generator with a small seed space is still only as unpredictable as its seed. Making a token longer does not help if every token is a function of a seed that can be searched.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">counts for an observer who knows roughly when a seed was made; nothing here seeds or attacks a real generator</Provenance>
        <ClaimLabel kind="practice">seed from the operating system's generator, not from a clock</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
