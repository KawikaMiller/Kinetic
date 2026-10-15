import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { ConsolePanel, type ConsoleLine } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { parseBoundedInt } from '../../core/parse';
import { call, importInstance, type CallResult } from './engine';
import { moduleFields } from './fields';
import { IMPORT_BYTES } from './modules';
import { importsCaption } from './captions';
import { importsFor, type Missing } from './imports';

const DIV = { a: 7, b: 2 };
const OPERAND_RANGE = { min: -1000, max: 1000 } as const;

const operand = (text: string) => parseBoundedInt(text, { min: OPERAND_RANGE.min, max: OPERAND_RANGE.max, messages: { invalid: (t) => `"${t}" is not a whole number.` } });

/** Scene 4: the sandbox. A module that declares an import cannot be created without it; handed one, it can only reach what it is given. */
export function ImportsScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [granted, setGranted] = useState(false);
  const [missing, setMissing] = useState<Missing>('env');
  const [logged, setLogged] = useState<number[]>([]);
  const [aText, setAText] = useState(String(DIV.a));
  const [bText, setBText] = useState(String(DIV.b));
  const [last, setLast] = useState<{ label: string; result: CallResult } | null>(null);
  const aParse = operand(aText);
  const bParse = operand(bText);

  const made = useMemo(() => importInstance(importsFor(granted, missing, (n) => setLogged((l) => [...l, n]))), [granted, missing]);
  const fields = useMemo(() => moduleFields(IMPORT_BYTES), []);

  useEffect(() => {
    setCaption(importsCaption({ granted, missing, made: made.ok ? null : made.errorClass, last }), { quiet: true });
  }, [setCaption, granted, missing, made, last]);

  const doRun = () => {
    if (!made.ok) return;
    setLast({ label: 'run(42)', result: call(made.instance, 'run', 42) });
  };
  const doDiv = (x: number, y: number) => {
    if (!made.ok) return;
    setLast({ label: `div(${x}, ${y})`, result: call(made.instance, 'div', x, y) });
  };
  const lines: ConsoleLine[] = [
    ...logged.map((n) => `env.log(${n})`),
    ...(last && !last.result.ok ? [{ text: `${last.label}: ${last.result.errorClass}`, tone: 'bad' as const }] : []),
    ...(last && last.result.ok && last.label.startsWith('div') ? [`${last.label} = ${last.result.value}`] : []),
  ];

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Instantiating" value={made.ok ? 'works' : made.errorClass} color={made.ok ? 'var(--ok)' : 'var(--orange)'} sub={made.ok ? 'the import was handed over' : 'refused at link time, not a crash'} />
          <Stat label="Last call" value={last ? (last.result.ok ? `${last.label}${last.result.value === undefined ? '' : ` = ${last.result.value}`}` : `${last.label}: ${last.result.errorClass}`) : 'none yet'} color={last && !last.result.ok ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--orange)', label: 'a missing import: refused when linking', shape: 'square' }, { color: 'var(--ok)', label: 'instantiated', shape: 'square' }, { color: 'var(--bad)', label: 'a trap while running', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Grant env.log" value={granted} onChange={(g) => { setGranted(g); setLast(null); setLogged([]); }} off="Withhold" on="Hand it over" />
          {!granted && <Segmented label="What is missing" value={missing} onChange={setMissing} options={[{ value: 'env', label: 'the whole env object' }, { value: 'log', label: 'just log' }]} />}
        </>,
        <>
          <Button variant="primary" disabled={!made.ok} onClick={doRun}>run(42)</Button>
          <TextField label="div a" value={aText} onChange={setAText} width={80} spellCheck={false} ariaLabel="Numerator, -1000 to 1000" />
          <TextField label="b" value={bText} onChange={setBText} width={80} spellCheck={false} ariaLabel="Divisor, -1000 to 1000" />
          <Button disabled={!made.ok || !aParse.ok || !bParse.ok} onClick={() => aParse.ok && bParse.ok && doDiv(aParse.value, bParse.value)}>Call div</Button>
          <ControlGroup label="Try" inline>
            <ChipButton tone="info" disabled={!made.ok} onClick={() => { setAText('7'); setBText('2'); doDiv(7, 2); }}>div(7, 2)</ChipButton>
            <ChipButton tone="bad" disabled={!made.ok} onClick={() => { setAText('1'); setBText('0'); doDiv(1, 0); }}>div(1, 0)</ChipButton>
          </ControlGroup>
          {!aParse.ok && <Hint tone="muted"><span role="alert">{aParse.error}</span></Hint>}
          {!bParse.ok && <Hint tone="muted"><span role="alert">{bParse.error}</span></Hint>}
        </>,
      ]}
    >
      <div className="wa stage-pad">
        <Box variant="sunken">
          <SectionTitle hint="what the module has been handed">The host’s side</SectionTitle>
          <p className="wa-note">
            A module can only call what its imports name, and the host decides what those are. Here the host holds one function, <code>env.log</code>, which records the number it is called with. There is no DOM, network or file access unless an import is handed over.
          </p>
          <ConsolePanel title="host log" lines={lines} empty={made.ok ? 'nothing logged yet: press run(42)' : 'the module was never created, so nothing can run'} />
        </Box>
        <ByteGrid bytes={IMPORT_BYTES} perRow={8} fields={fields} ariaLabel="The bytes of the import module" />
        <ProvenanceRow>
          <Provenance kind="real">linking errors and the divide trap come from this browser’s own WebAssembly engine; the page shows their classes, not engine-specific messages</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
