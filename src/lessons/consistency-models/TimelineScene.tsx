import { useMemo, useState, type ReactNode } from 'react';
import { LaneEditor } from '../../components/LaneEditor';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Slider } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { LaneItem } from '../../core/laneEditor';
import { selectedItem } from '../../core/laneEditor';
import { timelineCaption } from './captions';
import { clientTone } from './historyBars';
import {
  CLIENTS, DEFAULT_PRESET, INITIAL_VALUE, MODEL_NAME, NO_QUIET, ORDER_MODELS, PRESETS, VALUE_MAX, barLabel, explainViolation, freshReadValue, nextWriteValue,
  opLabel, opsOf, setValue, smallestViolation, verdictsOf, witnessOrder, type Kind, type OpData, type OpModel, type OrderModel, type Preset,
} from './model';
import { VerdictStats } from './VerdictStats';

const SLOT_W = 26;
const LANE_H = 48;
const BAR_H = 24;
const BAR_INSET = 3;
const UNDO_DEPTH = 20;
const KIND_OPTIONS = [{ value: 'write' as const, label: 'Write' }, { value: 'read' as const, label: 'Read' }];
const FOCUS_OPTIONS = ORDER_MODELS.map((m) => ({ value: m, label: m }));
const VIEWER_OPTIONS = CLIENTS.map((c) => ({ value: c, label: c }));
const VALUES = Array.from({ length: VALUE_MAX + 1 }, (_, v) => v);
const quietText = (v: number) => (v === NO_QUIET ? 'not set' : String(v));

export function TimelineScene({ picker }: { picker: ReactNode }) {
  const [model, setModel] = useState<OpModel>(() => DEFAULT_PRESET.model());
  const [loaded, setLoaded] = useState<string | null>(DEFAULT_PRESET.id);
  const [quiet, setQuiet] = useState<number[]>(() => [...DEFAULT_PRESET.quiet]);
  const [newKind, setNewKind] = useState<Kind>('write');
  const [focus, setFocus] = useState<OrderModel>('linearizable');
  const [viewer, setViewer] = useState<string>(CLIENTS[0]);
  const [undo, setUndo] = useState<OpModel[]>([]);
  const [message, setMessage] = useState('');

  const ops = useMemo(() => opsOf(model), [model]);
  const verdicts = useMemo(() => verdictsOf(ops, { values: quiet }), [ops, quiet]);
  const subsets = useMemo(
    () => Object.fromEntries(ORDER_MODELS.map((m) => [m, smallestViolation(m, ops)])) as Record<OrderModel, ReturnType<typeof smallestViolation>>,
    [ops],
  );
  const order = useMemo(() => witnessOrder(focus, ops, focus === 'causal' ? viewer : undefined), [focus, ops, viewer]);
  const ringed = new Set(subsets[focus]?.map((o) => o.id));
  const position = new Map(order?.map((o, i) => [o.id, i + 1]));
  const selected = selectedItem(model);

  useIntroCaption(
    timelineCaption({ ops, verdicts, focus, viewer, subset: subsets[focus] }),
    [ops, quiet, focus, viewer],
  );

  const load = (p: Preset) => {
    setModel(p.model());
    setQuiet([...p.quiet]);
    setLoaded(p.id);
    setUndo([]);
    setMessage('');
  };
  const change = (next: OpModel) => {
    if (next.items !== model.items || next.links !== model.links) {
      setUndo((u) => [...u.slice(-(UNDO_DEPTH - 1)), model]);
      setLoaded(null);
    }
    setModel(next);
    setMessage('');
  };
  const applyValue = (value: number) => {
    if (!selected) return;
    const edit = setValue(model, selected.id, value);
    if (edit.ok) change(edit.model);
    else setMessage(edit.reason);
  };
  const stepBack = () => {
    const previous = undo.at(-1);
    if (!previous) return;
    setUndo((u) => u.slice(0, -1));
    setModel(previous);
    setMessage('');
  };

  const newData = (_lane: number, slot: number): OpData =>
    newKind === 'write' ? { kind: 'write', value: nextWriteValue(model) ?? VALUE_MAX } : { kind: 'read', value: freshReadValue(model, slot) };

  const drawBar = (item: LaneItem<OpData>, geo: { slotLeft: (s: number) => number; laneCentre: (l: number) => number }, isSelected: boolean) => {
    const cy = geo.laneCentre(item.lane);
    const x = geo.slotLeft(item.start) + BAR_INSET;
    const width = geo.slotLeft(item.end + 1) - BAR_INSET - x;
    const place = position.get(item.id);
    return (
      <g className={`tone-${clientTone(CLIENTS[item.lane])}`}>
        <rect className={`cm-bar is-${item.data.kind}`} x={x} y={cy - BAR_H / 2} width={width} height={BAR_H} rx={5} />
        {ringed.has(item.id) && <rect className="cm-ring-subset" x={x - 3} y={cy - BAR_H / 2 - 3} width={width + 6} height={BAR_H + 6} rx={8} />}
        {isSelected && <rect className="cm-ring-selected" x={x - 6} y={cy - BAR_H / 2 - 6} width={width + 12} height={BAR_H + 12} rx={10} />}
        <text className={`cm-bar-label is-${item.data.kind}`} x={x + width / 2} y={cy} textAnchor="middle" dominantBaseline="central">{barLabel(item.data)}</text>
        {place !== undefined && (
          <g className="cm-order">
            <circle cx={x + 6} cy={cy - BAR_H / 2 - 2} r={7} />
            <text x={x + 6} y={cy - BAR_H / 2 - 2} textAnchor="middle" dominantBaseline="central">{place}</text>
          </g>
        )}
      </g>
    );
  };

  const lines = ORDER_MODELS.map((m) => {
    const v = verdicts[m];
    const subset = subsets[m];
    return { m, ok: v.ok, text: v.ok ? 'holds.' : subset ? explainViolation(m, subset) : v.message };
  });

  return (
    <StageFrame
      height={380}
      stats={
        <VerdictStats
          verdicts={verdicts}
          converged={verdicts.converged}
          subsetSizes={Object.fromEntries(ORDER_MODELS.flatMap((m) => (subsets[m] ? [[m, subsets[m]!.length]] : [])))}
        />
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'C1' },
            { color: 'var(--sky)', label: 'C2' },
            { color: 'var(--pink)', label: 'C3' },
            { color: 'var(--ok)', label: 'model holds' },
            { color: 'var(--bad)', label: 'model fails' },
            { color: 'var(--hi)', label: 'smallest violating set', shape: 'line' },
            { color: 'var(--info)', label: 'one order that works', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" size="md" on={loaded === p.id} onClick={() => load(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="New bar" value={newKind} onChange={setNewKind} options={KIND_OPTIONS} />
          <ControlGroup label="Value of the selected bar" inline>
            {VALUES.map((v) => (
              <ChipButton
                key={v}
                tone="muted"
                disabled={!selected}
                on={selected ? selected.data.value === v : undefined}
                ariaLabel={`Set the selected bar's value to ${v}`}
                onClick={() => applyValue(v)}
              >
                {v}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          {CLIENTS.map((c, i) => (
            <Slider
              key={c}
              label={`${c} quiet read`}
              value={quiet[i]}
              min={NO_QUIET}
              max={VALUE_MAX}
              format={quietText}
              onChange={(v) => setQuiet((q) => q.map((old, j) => (j === i ? v : old)))}
            />
          ))}
        </>,
        <>
          <Segmented label="Show the verdict for" value={focus} onChange={setFocus} options={FOCUS_OPTIONS} />
          {focus === 'causal' && <Segmented label="From the view of" value={viewer} onChange={setViewer} options={VIEWER_OPTIONS} />}
          <Button disabled={undo.length === 0} onClick={stepBack}>Undo</Button>
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <LaneEditor
          model={model}
          onChange={change}
          onRefuse={setMessage}
          laneLabels={CLIENTS}
          newData={newData}
          ariaLabel="History of operations on the register x, one row per client"
          describeItem={(item) => `${CLIENTS[item.lane]} ${opLabel(item.data)}, slots ${item.start} to ${item.end}`}
          slotWidth={SLOT_W}
          laneHeight={LANE_H}
          renderItem={(item, geo, { selected: isSelected }) => drawBar(item, geo, isSelected)}
        />
        <p className="cm-status" role="status">{message || `x starts at ${INITIAL_VALUE}. ${ops.length} of ${model.limits.maxItems} operations placed.`}</p>
        <Box className="cm-why">
          <SectionTitle>What each model says</SectionTitle>
          <ul className="cm-why-list">
            {lines.map(({ m, ok, text }) => (
              <li key={m} className={ok ? 'is-ok' : 'is-bad'}>
                <b>{ok ? '✓' : '✗'} {MODEL_NAME[m]}:</b> {text}
              </li>
            ))}
            <li className={`is-${verdicts.converged.state}`}>
              <b>{verdicts.converged.state === 'ok' ? '✓' : verdicts.converged.state === 'bad' ? '✗' : '–'} Converged:</b> {verdicts.converged.message}
            </li>
          </ul>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">the checkers try orderings of at most {model.limits.maxItems} operations; real checkers use smarter search</Provenance>
          <Provenance kind="illustrative">the presets are hand-built histories, not recorded from any system</Provenance>
          <Provenance kind="from-memory">definitions: Lamport 1979 (sequential), Herlihy and Wing 1990 (linearizable), Ahamad et al. 1995 (causal); check the papers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
