import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useInterval } from '../../core/useInterval';
import { firstMatch, lcmN, productN, solve } from './crt';
import { Gear } from './Gear';
import { OPENING } from './presets';
import { SystemFields } from './SystemFields';
import { useSystem } from './useSystem';

const TICK_MS = 140;
const STAGE_MIN_WIDTH = 400;

/** Scene 1, the gears: advance x one tick at a time and watch every gear's pointer; all dials light at the answer. */
export function GearsScene({ picker }: { picker: ReactNode }) {
  const state = useSystem(OPENING.gears.system, 3);
  const { moduli, residues } = state.system;
  const [x, setX] = useState<number>(OPENING.gears.x);
  const [playing, setPlaying] = useState(false);

  const range = lcmN(moduli);
  const first = useMemo(() => firstMatch(state.system, range), [state.system, range]);
  const verdict = useMemo(() => solve(state.system), [state.system]);
  const at = Math.min(x, range - 1);
  const lit = moduli.map((m, i) => at % m === residues[i]);
  const allLit = lit.every(Boolean);

  const advance = () => setX((v) => Math.min(range - 1, Math.min(v, range - 1) + 1));
  useInterval(() => {
    if (allLit || at >= range - 1) setPlaying(false);
    else advance();
  }, TICK_MS, playing);

  return (
    <StageFrame
      height={460}
      minWidth={STAGE_MIN_WIDTH}
      intro={
        first === null
          ? <>No x from 0 to {range - 1} lights every gear: these congruences contradict each other, and the range of {range} is where the pattern would repeat.</>
          : <>The first x that lights every gear is {first}, inside a range of {range}. Step x, play it, or jump straight there.</>
      }
      introKey={`${moduli.join('-')}-${residues.join('-')}`}
      stats={
        <Stats>
          <Stat label="x" value={at} color={allLit ? 'var(--ok)' : 'var(--hi)'} sub={allLit ? 'every gear is on its remainder' : `${lit.filter(Boolean).length} of ${moduli.length} gears lit`} />
          <Stat label="Range before it repeats" value={range} color="var(--info)" sub={range === productN(moduli) ? `product ${moduli.join(' x ')}` : `lcm; the product ${productN(moduli)} is larger`} />
          <Stat label="First x where all match" value={first ?? 'none'} color={first === null ? 'var(--bad)' : 'var(--ok)'} sub={verdict.ok ? `unique mod ${verdict.modulus}` : 'the congruences contradict each other'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'pointer: x mod m', shape: 'line' },
            { color: 'var(--ok)', label: 'gear on its wanted remainder', shape: 'dot' },
            { color: 'var(--dim)', label: 'gear not matching', shape: 'dot' },
            { color: 'var(--info)', label: 'range (modulus of the answer)', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Button variant="primary" softDisabled={at >= range - 1} onClick={advance}>Step x</Button>
          <Button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</Button>
          <Button softDisabled={first === null} onClick={() => { setPlaying(false); setX(first ?? 0); }}>Jump to first match</Button>
          <Button onClick={() => { setPlaying(false); setX(0); }}>Reset</Button>
          <Slider label="x" value={at} min={0} max={range - 1} onChange={(v) => { setPlaying(false); setX(v); }} />
        </>,
        <SystemFields key="fields" state={state} />,
      ]}
    >
      <div className="cr-stage stage-pad">
        <div className="cr-gears">
          {moduli.map((m, i) => (
            <Gear key={i} modulus={m} residue={residues[i]} x={at} />
          ))}
        </div>
        <p className="cr-note">
          {allLit ? <>x = {at}: <b className="ok">every gear matches</b>. {verdict.ok ? `Adding ${verdict.modulus} to x gives the same lights again.` : ''}</> : <>x = {at}: remainders {moduli.map((m) => at % m).join(', ')} against the wanted {residues.join(', ')}.</>}
          {' '}Sun Tzu's puzzle is a classic; the attribution is traditional.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes: moduli of 2 to 30, no keys</Provenance>
        <Provenance kind="real">the lights and the first match are computed by checking every x, not typed in</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
