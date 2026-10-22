import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { ByteGrid } from '../../components/ByteGrid';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useAsyncValue } from '../../core/useAsyncValue';
import { cooldownCaption, integrityCaption } from './captions';
import { fakeTarball, flipByte, hashBytes, installOutcome, shortHash } from './integrity';
import { COOLDOWN_RANGE, INSTALL_DAY_RANGE, initialIntegrity } from './opening';
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION, WITHDRAWN_DAY } from './registry';
import { releaseStatus } from './resolve';

const DAYS = Array.from({ length: INSTALL_DAY_RANGE.max - INSTALL_DAY_RANGE.min + 1 }, (_, i) => INSTALL_DAY_RANGE.min + i);
const CELL_MAX = 52;

/** Scene 2: a recorded hash, one flipped byte, and a cooldown that holds a young release back. */
export function IntegrityScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialIntegrity);
  const { flipped, checkOn, installDay, cooldown } = state;
  const genuine = useMemo(() => fakeTarball(), []);
  const arrived = useMemo(() => (flipped === null ? genuine : flipByte(genuine, flipped)), [genuine, flipped]);
  const recorded = useAsyncValue(() => hashBytes(genuine), 'genuine');
  const actual = useAsyncValue(() => hashBytes(arrived), `arrived-${flipped}`);
  const ready = recorded !== null && actual !== null;
  const outcome = ready ? installOutcome(recorded, actual, checkOn) : null;
  const status = releaseStatus({ day: installDay, cooldown });
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));
  const dayTone = (d: number) => {
    const s = releaseStatus({ day: d, cooldown });
    return s === 'picked-up' ? ('bad' as const) : s === 'held-back' ? ('ok' as const) : ('dim' as const);
  };

  return (
    <StageFrame
      height={470}
      intro={
        <>
          {integrityCaption(flipped, checkOn, recorded, actual)} Cooldown row, a separate demo that does not change the service counts of scene 1: {cooldownCaption(installDay, cooldown)}
        </>
      }
      introKey={[flipped ?? -1, checkOn, recorded ?? '', actual ?? '', installDay, cooldown]}
      stats={
        <Stats>
          <Stat label="Install" value={outcome === null ? 'hashing' : outcome.result} color={outcome === null ? 'var(--muted)' : outcome.result === 'refused' ? 'var(--ok)' : outcome.changedInstalled ? 'var(--bad)' : 'var(--ok)'} sub={outcome?.changedInstalled ? 'changed bytes went in' : checkOn ? 'integrity check on' : 'integrity check off'} />
          <Stat label="The bad release" value={status === 'held-back' ? 'held back' : status === 'withdrawn' ? 'pulled' : 'installed'} color={status === 'picked-up' ? 'var(--bad)' : status === 'held-back' ? 'var(--ok)' : 'var(--dim)'} sub={`${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION}, day ${installDay}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'check passed, or release held back', shape: 'square' },
            { color: 'var(--bad)', label: 'check failed, or release installed', shape: 'square' },
            { color: 'var(--dim)', label: 'release already pulled', shape: 'square' },
            { color: 'var(--hi)', label: 'the install day', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Integrity check" value={checkOn} onChange={(v) => set({ checkOn: v })} />
        </>,
        <>
          <Slider label="Install day" value={installDay} {...INSTALL_DAY_RANGE} onChange={(v) => set({ installDay: v })} />
          <Slider label="Cooldown (days)" value={cooldown} {...COOLDOWN_RANGE} onChange={(v) => set({ cooldown: v })} />
        </>,
      ]}
    >
      <div className="sc-stage stage-pad">
        <div className="sc-block">
          <SectionTitle>The fake tarball, 256 bytes: click a byte to flip one bit of it (click again to put it back)</SectionTitle>
          <ByteGrid
            bytes={arrived}
            perRow={16}
            highlight={flipped === null ? [] : [{ i: flipped, tone: 'bad' }]}
            onByteClick={(i) => set({ flipped: flipped === i ? null : i })}
            ariaLabel="The fake tarball bytes: press one to flip it"
          />
        </div>
        <div className="sc-block">
          <table className="data-table">
            <tbody>
              <tr>
                <td>recorded in the lockfile</td>
                <td>{shortHash(recorded)}</td>
              </tr>
              <tr>
                <td>of the bytes that arrived</td>
                <td style={{ color: ready && recorded !== actual ? 'var(--bad)' : 'var(--ok)' }}>{shortHash(actual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sc-block">
          <SectionTitle>Cooldown: days since the bad release was published (it is pulled on day {WITHDRAWN_DAY})</SectionTitle>
          <ArrayStrip
            values={DAYS.map(String)}
            cellMax={CELL_MAX}
            cellTone={(i) => dayTone(DAYS[i])}
            pointers={[{ i: installDay - INSTALL_DAY_RANGE.min, label: 'install', tone: 'hi' }]}
            onCellClick={(i) => set({ installDay: DAYS[i] })}
            cellTitle={(i) => `Install on day ${DAYS[i]}`}
          />
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the SHA-256 is computed in your browser by crypto.subtle</Provenance>
        <Provenance kind="simulated">fake bytes and a fictional registry: the tarball holds nothing and the compromise is a flag</Provenance>
        <Provenance kind="from-memory">some package managers support a cooldown setting: check each tool's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
