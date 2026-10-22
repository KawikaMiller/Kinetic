import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { burstCaption } from './captions';
import { BURST, RESOLUTION_MS, RULE_TEXT, burstRows, hlcText } from './hlc';

const RESOLUTIONS = RESOLUTION_MS.map((value) => ({ value, label: `${value} ms` }));

export function BurstScene({ picker }: { picker: ReactNode }) {
  const [resolution, setResolution] = useState<number>(RESOLUTION_MS[0]);
  const [burst, setBurst] = useState<number>(BURST.default);
  const rows = useMemo(() => burstRows(resolution, burst), [resolution, burst]);
  const distinctPhysical = new Set(rows.map((r) => r.pt)).size;
  const distinctHybrid = new Set(rows.map((r) => hlcText(r.hlc))).size;
  const largest = Math.max(...rows.map((r) => r.hlc.c));

  return (
    <StageFrame
      height={430}
      intro={burstCaption({ resolution, burst, distinctPhysical, distinctHybrid, largest })}
      introKey={`${resolution}|${burst}`}
      stats={
        <Stats>
          <Stat label="Distinct physical stamps" value={`${distinctPhysical} of ${burst}`} color={distinctPhysical < burst ? 'var(--bad)' : 'var(--ok)'} sub="ties cannot order events" />
          <Stat label="Distinct hybrid stamps" value={`${distinctHybrid} of ${burst}`} color={distinctHybrid === burst ? 'var(--ok)' : 'var(--bad)'} sub="the counter breaks the ties" />
          <Stat label="Largest counter" value={largest} sub="returns to 0 when the clock moves" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--dim)', label: 'a physical reading' }, { color: 'var(--hi)', label: 'a hybrid stamp' }, { color: 'var(--violet)', label: 'its counter' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Clock resolution" options={RESOLUTIONS} value={resolution} onChange={setResolution} />
          <Slider label="Events in the burst" value={burst} min={BURST.min} max={BURST.max} format={(v) => `${v} events`} onChange={setBurst} />
        </>,
      ]}
    >
      <div className="hl-stage stage-pad">
        <Box>
          <SectionTitle hint="one node, one event per millisecond, a clock that reads multiples of the resolution">A burst inside one clock reading</SectionTitle>
          <div className="hl-table-wrap">
            <table className="data-table">
              <thead><tr><th>true t</th><th>physical</th><th>hybrid (l, c)</th><th>counter</th><th>rule</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.t}>
                    <td>{r.t}</td><td className="hl-physical">{r.pt}</td><td className="hl-hybrid">{hlcText(r.hlc)}</td>
                    <td><span className="hl-bar" style={{ width: `${6 + r.hlc.c * 5}px` }} />{r.hlc.c}</td>
                    <td className="hl-rule">{RULE_TEXT[r.rule]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint block>The counter stays small because it only counts events inside one reading: when the physical clock moves past l, l takes it and c returns to 0.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a single node and a made-up burst, to show the counter</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
