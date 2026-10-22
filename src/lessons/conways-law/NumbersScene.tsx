import { useMemo } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Stat, Stats } from '../../components/ui';
import { layoutCaption, placeAll } from './captions';
import { CHANGES, PRESETS, SERVICES, TEAMS, isPlaced, layoutFrom, metrics, type Metrics } from './model';
import type { SceneProps } from './opening';
import { CapSlider, ConwayChips, PresetChips } from './parts';

const PRESET_KEYS = Object.keys(PRESETS) as (keyof typeof PRESETS)[];

/** Scene 2: what the numbers say, per team and per change, beside the three presets. */
export function NumbersScene({ picker, board, onBoard, cap, onCap }: SceneProps) {
  const layout = useMemo(() => layoutFrom(board.answers), [board]);
  const m = isPlaced(layout) ? metrics(layout, cap) : null;
  const presetMetrics: Record<string, Metrics> = Object.fromEntries(PRESET_KEYS.map((k) => [k, metrics(PRESETS[k].layout, cap)]));
  const pick = (key: keyof typeof PRESETS) => onBoard({ answers: { ...PRESETS[key].layout }, checked: false });

  return (
    <StageFrame
      height={820}
      intro={m ? layoutCaption(m, cap) : placeAll(layout)}
      introKey={`${JSON.stringify(layout)}|${cap}`}
      stats={
        <Stats>
          <Stat label="Handoffs" value={m ? m.handoffs : '–'} />
          <Stat label="Interfaces" value={m ? m.interfaces : '–'} color={m && m.interfaces > 0 ? 'var(--bad)' : undefined} />
          <Stat label="Largest cognitive load" value={m ? m.maxCognitive : '–'} color={m ? (m.over.length ? 'var(--bad)' : 'var(--ok)') : undefined} sub={`cap ${cap}`} />
        </Stats>
      }
      controls={[<>{picker}<PresetChips layout={layout} onPick={pick} /></>, <><CapSlider cap={cap} onCap={onCap} /></>]}
    >
      <div className="cw-stage stage-pad">
        {!m && <Hint tone="muted" block>Place all 8 services on the first scene, or press a preset, to fill these tables.</Hint>}
        <table className="data-table cw-table">
          <caption>Cognitive load per team: complexity owned plus one for each cross-team call touching a service it owns</caption>
          <thead><tr><th>Team</th><th>Services</th><th>Owned</th><th>Load</th></tr></thead>
          <tbody>
            {TEAMS.map((t) => {
              const owned = m ? SERVICES.filter((s) => layout[s.id] === t) : [];
              const load = m?.cognitive[t] ?? 0;
              return (
                <tr key={t}>
                  <td>Team {t}</td>
                  <td>{owned.map((s) => s.id).join(', ') || '–'}</td>
                  <td>{m ? m.owned[t] : '–'}</td>
                  <td style={m && load > cap ? { color: 'var(--bad)' } : undefined}>{m ? `${load}${load > cap ? ` (over ${cap})` : ''}` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="data-table cw-table">
          <caption>Changes: a change that touches three teams is flagged</caption>
          <thead><tr><th>Change</th><th>What</th><th>Teams touched</th><th>Handoffs</th></tr></thead>
          <tbody>
            {CHANGES.map((c) => {
              const n = m?.teamsTouched[c.id];
              return (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.label}</td>
                  <td style={n !== undefined && n >= 3 ? { color: 'var(--bad)' } : undefined}>{n ?? '–'}{n !== undefined && n >= 3 ? ' (three teams)' : ''}</td>
                  <td>{n === undefined ? '–' : n - 1}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <table className="data-table cw-table">
          <caption>The three presets on four axes: none is best on all of them</caption>
          <thead><tr><th>Layout</th><th>Handoffs</th><th>Interfaces</th><th>Largest load</th><th>Skill peers</th></tr></thead>
          <tbody>
            {PRESET_KEYS.map((k) => (
              <tr key={k}>
                <td>{PRESETS[k].label}</td>
                <td>{presetMetrics[k].handoffs}</td>
                <td>{presetMetrics[k].interfaces}</td>
                <td style={presetMetrics[k].over.length ? { color: 'var(--bad)' } : undefined}>{presetMetrics[k].maxCognitive}</td>
                <td>{presetMetrics[k].peers}</td>
              </tr>
            ))}
            {m && (
              <tr className="cw-yours">
                <td>Yours</td><td>{m.handoffs}</td><td>{m.interfaces}</td><td style={m.over.length ? { color: 'var(--bad)' } : undefined}>{m.maxCognitive}</td><td>{m.peers}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="cw-note">
          Skill peers are the fourth axis on purpose: a layered split keeps people with the same skill together, which is why teams are often drawn that way, so it is not a straw man here. It costs handoffs and interfaces instead.
        </p>
        <ConwayChips />
      </div>
    </StageFrame>
  );
}
