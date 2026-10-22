import { WideRegion } from '../../components/WideRegion';
import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer, pct, sig } from '../../core/format';
import { originCaption } from './captions';
import { initialOrigin } from './init';

/** Narrowest width where this table still reads; below it the table scrolls sideways inside its box. */
const TABLE_MIN_WIDTH = 480;
import {
  CLASS_NAME, DEFENCES, DEFENCE_NAME, HELPS, LEGIT_RATE, LOAD_CLASSES, PRESETS, RATE_RANGE, RESOURCE, RESOURCES, SOURCE_COUNTS, TARGET, UNIT_NAME, defaultInput, origin,
  type LoadClass, type OriginInput,
} from './origin';

export function OriginScene({ picker }: { picker: ReactNode }) {
  const [input, setInput] = useState<OriginInput>(initialOrigin);
  const r = useMemo(() => origin(input), [input]);
  const range = RATE_RANGE[input.cls];
  const set = (patch: Partial<OriginInput>) => setInput((x) => ({ ...x, ...patch }));

  useIntroCaption(originCaption(input, r), [JSON.stringify(input)]);

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Legitimate requests served" value={`${sig(r.goodput)}/s`} color={r.saturated.length ? 'var(--bad)' : 'var(--ok)'} sub={[`${pct(r.goodputShare, 0)} of ${LEGIT_RATE}/s`]} />
          <Stat label="Unwanted load past the defences" value={`${integer(Math.round(r.admittedRate))}`} color="var(--orange)" sub={[`${UNIT_NAME[input.cls]}, of ${integer(input.rate)} sent`]} />
          <Stat label="Saturated" value={r.saturated.length ? r.saturated.map((id) => RESOURCE[id].name).join(', ') : 'nothing'} color={r.saturated.length ? 'var(--bad)' : 'var(--ok)'} sub={['the resource that drops in proportion']} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'legitimate load' },
            { color: 'var(--orange)', label: 'the abstract unwanted stream' },
            { color: 'var(--bad)', label: 'a saturated resource' },
            { color: 'var(--violet)', label: 'a defence layer' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" onClick={() => setInput(p.input())}>{p.label}</ChipButton>
          ))}
          <Button onClick={() => setInput(initialOrigin())}>Reset</Button>
        </>,
        <>
          <Segmented label="Kind of load" value={input.cls} onChange={(cls: LoadClass) => setInput((x) => ({ ...defaultInput(cls), defences: x.defences, sources: x.sources }))} options={LOAD_CLASSES.map((c) => ({ value: c, label: CLASS_NAME[c] }))} />
          <Slider label={`Rate (${UNIT_NAME[input.cls]})`} value={input.rate} min={range.min} max={range.max} step={range.step} format={(v) => integer(v)} onChange={(rate) => set({ rate })} />
        </>,
        <>
          {DEFENCES.map((d) => (
            <ChipButton key={d} tone="violet" on={input.defences[d]} onStyle="solid" onClick={() => set({ defences: { ...input.defences, [d]: !input.defences[d] } })}>{DEFENCE_NAME[d]}</ChipButton>
          ))}
          {input.defences.perSource && (
            <Segmented label="Sources" value={input.sources} onChange={(sources) => set({ sources })} options={SOURCE_COUNTS.map((n) => ({ value: n as number, label: integer(n) }))} />
          )}
        </>,
      ]}
    >
      <div className="dd-stage stage-pad">
        <div className="dd-resources">
          {RESOURCES.map((id) => {
            const l = r.loads.find((x) => x.id === id)!;
            const total = l.legit + l.attack;
            return (
              <Box key={id} className={l.saturated ? 'is-saturated' : ''}>
                <SectionTitle hint={`capacity ${integer(l.capacity)} ${RESOURCE[id].unit}`}>{RESOURCE[id].name}{TARGET[input.cls] === id ? ' (the target)' : ''}</SectionTitle>
                <Bar
                  segments={[{ value: l.legit, tone: 'info' }, { value: l.attack, tone: 'orange' }]}
                  max={Math.max(l.capacity, total)}
                  marker={l.capacity}
                  markLabel="capacity"
                  height={14}
                  ariaLabel={`${RESOURCE[id].name}: ${integer(Math.round(total))} asked of ${integer(l.capacity)}`}
                />
                <p className={`dd-note ${l.saturated ? 'is-bad' : ''}`}>
                  {integer(Math.round(total))} asked of {integer(l.capacity)} {RESOURCE[id].unit}: {l.saturated ? `saturated, ${pct(l.served, 0)} of it is served` : 'it holds'}
                </p>
              </Box>
            );
          })}
        </div>
        <Box>
          <SectionTitle hint="what each defence does for each kind of load">What helps what</SectionTitle>
          <WideRegion minWidth={TABLE_MIN_WIDTH} hint="swipe to see the whole table">
            <table className="data-table dd-table">
              <thead>
                <tr><th>Defence</th>{LOAD_CLASSES.map((c) => <th key={c} className={c === input.cls ? 'is-current' : ''}>{CLASS_NAME[c]}</th>)}</tr>
              </thead>
              <tbody>
                {DEFENCES.map((d) => (
                  <tr key={d} className={input.defences[d] ? 'is-on' : ''}>
                    <th scope="row">{DEFENCE_NAME[d]}</th>
                    {LOAD_CLASSES.map((c) => <td key={c} className={c === input.cls ? 'is-current' : ''}>{HELPS[d][c]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
        </Box>
        <Hint tone="muted" block>
          A simulated origin with a bandwidth bar, a half-open connection table and a CPU and database budget. A saturated resource drops in proportion, so every legitimate user loses the same share. The unwanted stream is only a rate: nothing here sends, builds or measures traffic.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated">a simulated origin; real volumetric floods are absorbed by providers upstream, and this page generates no traffic</Provenance>
          <Provenance kind="illustrative">every capacity, rate and defence effect is made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}

