import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { MESI_INTRO, accessCaption, memoryNote, n } from './captions';
import { BUS_NAMES, CORES, MESI_NAMES, opLabel, type Op } from './mesi';
import { mesiOpening, press, replayCounterexample, withProtocol } from './session';
import { STATE_TONE } from './tones';

const CORE_CELL = { cell: 46, gap: 4, font: 15 } as const;
const CORE_IDS = Array.from({ length: CORES }, (_, i) => i);

export function MesiScene({ picker }: { picker: ReactNode }) {
  const [session, setSession] = useState(mesiOpening);
  const { machine, last, log, protocol } = session;
  const caption = last ? accessCaption(last) : MESI_INTRO;
  const invalidating = protocol === 'mesi';
  const stale = (core: number) => machine.caches[core].state !== 'I' && machine.caches[core].value !== machine.latest;

  const cell = (r: number, c: number): GridCellSpec => {
    const cache = machine.caches[r];
    if (c === 0) return { text: cache.state, tone: STATE_TONE[cache.state], fill: cache.state === 'I' ? 'outline' : 'solid' };
    if (cache.state === 'I') return { text: '-', tone: 'dim', fill: 'none' };
    return stale(r) ? { text: cache.value, tone: 'bad', fill: 'solid' } : { text: cache.value, tone: STATE_TONE[cache.state], fill: 'tint', intensity: 0.3 };
  };

  const press1 = (op: Op) => setSession((s) => press(s, op));

  return (
    <StageFrame
      height={430}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Bus transactions" value={n(machine.busCount)} color="var(--violet)" sub="reads, read-for-ownership, upgrades" />
          <Stat label="Latest write" value={n(machine.latest)} sub="what a coherent read must return" />
          <Stat label="Memory holds" value={n(machine.memory)} color={machine.memory === machine.latest ? undefined : 'var(--bad)'} sub={memoryNote(machine)} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'M Modified: the only up-to-date copy', shape: 'square' },
            { color: 'var(--ok)', label: 'E Exclusive: the only copy, clean', shape: 'square' },
            { color: 'var(--info)', label: 'S Shared: clean, others may hold it', shape: 'square' },
            { color: 'var(--dim)', label: 'I Invalid: no copy', shape: 'square' },
            { color: 'var(--hi)', label: 'the core acting now', shape: 'square' },
            { color: 'var(--violet)', label: 'the bus transaction', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Invalidation" value={invalidating} onChange={(on) => setSession(withProtocol(on ? 'mesi' : 'no-invalidate'))} off="Off (broken)" on="On (MESI)" />
          <Button onClick={() => setSession(replayCounterexample())}>Replay the shortest failing sequence</Button>
          <Button onClick={() => setSession(withProtocol(protocol))}>Reset</Button>
        </>,
      ]}
    >
      <div className="cc-stage stage-pad">
        <div className="cc-mesi">
          <Box>
            <SectionTitle hint="one cache line, X">Each core&apos;s copy</SectionTitle>
            <CellGrid
              className="cc-cores"
              rows={CORES}
              cols={2}
              size={CORE_CELL}
              cell={cell}
              rowLabels={CORE_IDS.map((i) => `core ${i}`)}
              colLabels={['state', 'value']}
              rowDecor={(r) => ({ tone: STATE_TONE[machine.caches[r].state], style: 'rail', label: `${MESI_NAMES[machine.caches[r].state]}${stale(r) ? ', stale' : ''}` })}
              highlight={last ? [{ r: last.op.core, c: 0, tone: 'hi' }, { r: last.op.core, c: 1, tone: 'hi' }] : []}
              ariaLabel={`Cache line X in each of four cores: ${machine.caches.map((c, i) => `core ${i} ${MESI_NAMES[c.state]}${c.state === 'I' ? '' : ` holding ${c.value}`}`).join('; ')}`}
            />
          </Box>
          <Box className="cc-bus">
            <SectionTitle hint="the last access">The bus</SectionTitle>
            <div className="cc-bus-row" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={machine.busCount + (last ? `-${last.op.core}-${last.op.access}` : '')}
                  className={`cc-bus-chip ${last?.bus ? 'is-bus' : ''}`}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {last ? (last.bus ? BUS_NAMES[last.bus] : 'no bus traffic') : 'idle'}
                </motion.span>
              </AnimatePresence>
            </div>
            <ol className="cc-log" aria-label="Recent accesses">
              {log.map((r, i) => (
                <li key={`${log.length}-${i}-${r.machine.busCount}-${r.op.core}-${r.op.access}`} className={r.stale ? 'is-stale' : undefined}>
                  {opLabel(r.op)}: {r.bus ? BUS_NAMES[r.bus] : 'no bus'}
                  {r.op.access === 'read' ? `, read ${n(r.readValue ?? 0)}${r.stale ? ' (stale)' : ''}` : `, wrote ${n(r.written ?? 0)}`}
                </li>
              ))}
            </ol>
          </Box>
        </div>
        <div className="cc-buttons" role="group" aria-label="Accesses">
          {(['read', 'write'] as const).flatMap((access) =>
            CORE_IDS.map((core) => (
              <Button key={`${access}-${core}`} className="cc-btn" onClick={() => press1({ core, access })}>
                {access === 'read' ? 'Read' : 'Write'} core {core}
              </Button>
            )),
          )}
        </div>
        <Hint tone="muted" block>
          A write stores the next number, so a stale copy is easy to spot. Real cores also reorder accesses through store buffers; this model&apos;s bus transactions are atomic, and it has no store buffer.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">one cache line, atomic bus transactions, no store buffer, so real cores can show behaviour this model cannot</Provenance>
          <Provenance kind="from-memory">Intel is reported to use a MESIF variant and AMD a MOESI variant; large machines use directory protocols; verify against the vendor manuals</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
