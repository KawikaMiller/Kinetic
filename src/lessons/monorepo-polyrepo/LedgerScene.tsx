import { useEffect, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Hint, Legend, Provenance, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { ledgerCaption } from './captions';
import { FACTOR_LABEL, LINES, OPENING_FACTORS, lean, tally, type Factors, type Option } from './ledger';

const STEP = 5;
const OPTIONS: Option[] = ['monorepo', 'polyrepo'];
const points = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

function OptionCard({ option, f }: { option: Option; f: Factors }) {
  const t = tally(option, f);
  return (
    <Box className="mp-card" variant="sunken">
      <SectionTitle hint={`net ${points(t.net)}`}>{option}</SectionTitle>
      {(['benefit', 'cost'] as const).map((side) => (
        <div key={side} className="mp-side">
          <h4 className={`mp-side-title is-${side}`}>{side === 'benefit' ? 'What it gives' : 'What it costs'}</h4>
          <ul>
            {LINES.filter((l) => l.option === option && l.side === side).map((l) => (
              <li key={l.id}>
                <span>{l.text}</span> <ClaimLabel kind={l.claim} />
                <Bar value={l.points(f)} max={1} tone={side === 'benefit' ? 'ok' : 'bad'} height={6} ariaLabel={`${points(l.points(f))} points`} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Box>
  );
}

export function LedgerScene({ picker }: { picker: ReactNode }) {
  const [f, setF] = useState<Factors>(OPENING_FACTORS);
  const setCaption = useSetCaption();
  const result = lean(f);

  useEffect(() => {
    setCaption(ledgerCaption(f), { quiet: true });
  }, [setCaption, f]);

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          {OPTIONS.map((o) => (
            <Stat key={o} label={`${o} net`} value={points(tally(o, f).net)} color={result.option === o ? 'var(--hi)' : undefined} sub={`${points(tally(o, f).benefits)} given, ${points(tally(o, f).costs)} cost`} />
          ))}
          <Stat label="The ledger leans" value={result.option ?? 'level'} sub={`by ${points(result.margin)} points`} color="var(--hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'what the option gives (the cheap side)', shape: 'square' },
            { color: 'var(--bad)', label: 'what it costs (the costly side)', shape: 'square' },
            { color: 'var(--hi)', label: 'where the ledger leans', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {(Object.keys(FACTOR_LABEL) as (keyof Factors)[]).map((k) => (
            <Slider key={k} label={FACTOR_LABEL[k]} value={Math.round(f[k] * 100)} min={0} max={100} step={STEP} onChange={(v) => setF({ ...f, [k]: v / 100 })} format={(v) => `${v}%`} />
          ))}
        </>,
      ]}
    >
      <div className="mp stage-pad">
        <div className="mp-ledger">
          {OPTIONS.map((o) => (
            <OptionCard key={o} option={o} f={f} />
          ))}
        </div>
        <div className="mp-notes">
          <Provenance kind="illustrative">every weight is invented; both options are written out in full</Provenance>
          <ClaimLabel kind="view">the ledger is one view of how the factors trade off, not a measurement</ClaimLabel>
          <Hint block>Move the sliders to settings where each option wins: both do. Neither option is the answer in general.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
