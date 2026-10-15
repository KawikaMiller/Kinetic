import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { engineAdd } from './engine';
import { moduleFields } from './fields';
import { interpret } from './interp';
import { addModuleFor, ADD_BYTES, OPERATOR_AT, OPERATORS, operator, type OperatorId } from './modules';
import { bytesCaption } from './captions';

const ARG_RANGE = { min: -100, max: 100 } as const;
const DEFAULT_A = 7;
const DEFAULT_B = 3;

/** Scene 1: the 41 bytes of an add function, and the real engine's answer as the operator byte changes. */
export function BytesScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [op, setOp] = useState<OperatorId>('add');
  const [a, setA] = useState(DEFAULT_A);
  const [b, setB] = useState(DEFAULT_B);
  const bytes = useMemo(() => addModuleFor(op), [op]);
  const fields = useMemo(() => moduleFields(ADD_BYTES), []);
  const valid = useMemo(() => WebAssembly.validate(bytes as BufferSource), [bytes]);
  const engine = useMemo(() => engineAdd(op, a, b), [op, a, b]);
  const ours = useMemo(() => interpret(bytes, 0, [a, b]), [bytes, a, b]);
  const o = operator(op);
  const engineValue = engine.ok ? engine.value : undefined;
  const agree = engine.ok && ours.kind === 'value' && ours.value === engineValue;

  useEffect(() => {
    setCaption(bytesCaption({ op: o, a, b, engine, bytes, valid }), { quiet: true });
  }, [setCaption, o, a, b, engine, bytes, valid]);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Module" value={`${bytes.length} bytes`} sub={valid ? 'the engine validates it' : 'the engine rejects it'} color={valid ? undefined : 'var(--bad)'} />
          <Stat label={`The engine says add(${a}, ${b})`} value={engine.ok ? String(engineValue) : engine.errorClass} color={engine.ok ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="This page’s interpreter" value={ours.kind === 'value' ? String(ours.value) : 'trap'} sub={agree ? 'agrees with the engine' : 'does not agree'} color={agree ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'the operator byte you can change', shape: 'square' }, { color: 'var(--ok)', label: 'the engine’s real answer', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Operator byte" value={op} onChange={setOp} options={OPERATORS.map((x) => ({ value: x.id, label: `${x.name} 0x${x.byte.toString(16)}` }))} />
        </>,
        <>
          <Slider label="a" value={a} min={ARG_RANGE.min} max={ARG_RANGE.max} onChange={setA} />
          <Slider label="b" value={b} min={ARG_RANGE.min} max={ARG_RANGE.max} onChange={setB} />
        </>,
      ]}
    >
      <div className="wa stage-pad">
        <div className="wa-cols">
          <Box>
            <SectionTitle hint="shown, not compiled here">C-like source</SectionTitle>
            <CodePanel lines={['int add(int a, int b) {', `  return a ${o.c} b;`, '}']} gutter="none" />
          </Box>
          <Box>
            <SectionTitle hint="the text format, written by hand">Text format</SectionTitle>
            <CodePanel lines={['(func (export "add") (param i32 i32) (result i32)', '  local.get 0', '  local.get 1', `  ${o.name})`]} gutter="none" />
          </Box>
        </div>
        <ByteGrid bytes={bytes} perRow={8} fields={fields} highlight={[{ i: OPERATOR_AT, tone: 'hi' }]} ariaLabel="The bytes of the add module" />
        <ProvenanceRow>
          <Provenance kind="real">the answer comes from this browser’s own WebAssembly engine, running these bytes</Provenance>
          <Provenance kind="not-run">the compile step from C is shown, not run: these bytes were assembled by hand from the text format, not produced by a compiler here</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
