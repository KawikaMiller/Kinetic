import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ControlGroup, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ErCanvas } from './ErCanvas';
import { describe, endName, generateTables, kindOf, PRESETS, type End, type FkSide, type Relationship } from './model';
import { TablesPanel } from './TablesPanel';
import './styles.css';

/** Below this the cards' labels get too small to read, so the canvas scrolls instead. */
const CANVAS_MIN_WIDTH = 560;

type EndPatch = Partial<Pick<End, 'min' | 'max'>>;

export function Stage() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [rels, setRels] = useState<Relationship[]>(preset.rels);
  const [selected, setSelected] = useState(preset.rels[0].id);
  const setCaption = useSetCaption();

  const { entities } = preset;
  const { tables, issues } = generateTables(entities, rels);
  const rel = rels.find((r) => r.id === selected)!;
  const nameOf = (id: string) => entities.find((e) => e.id === id)!;
  const broken = new Set(issues.map((i) => i.relationship));
  const joins = tables.filter((t) => t.join).length;
  const fks = tables.reduce((n, t) => n + t.columns.filter((c) => c.kind === 'fk').length, 0);

  useIntroCaption(<>Each line is a relationship; the marks at its ends say how many. Pick one, change its ends, and watch the tables below rebuild.</>);

  const announce = (next: Relationship[], id: string) => {
    const r = next.find((x) => x.id === id)!;
    const problem = generateTables(entities, next).issues.find((i) => i.relationship === id);
    setCaption(<>{problem ? problem.text : `${kindOf(r)}: ${describe(r, entities)}`}</>, { quiet: true });
  };

  const choosePreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setRels(p.rels);
    setSelected(p.rels[0].id);
    setCaption(<>{p.label}: {p.rels.length} relationships. Pick one to edit.</>, { quiet: true });
  };
  const select = (id: string) => {
    setSelected(id);
    announce(rels, id);
  };
  const update = (patch: (r: Relationship) => Relationship) => {
    const next = rels.map((r) => (r.id === selected ? patch(r) : r));
    setRels(next);
    announce(next, selected);
  };
  const patchEnd = (side: 'a' | 'b', p: EndPatch) => update((r) => ({ ...r, [side]: { ...r[side], ...p } }));

  const endControls = (side: 'a' | 'b') => {
    const end = rel[side];
    const mine = endName(rel, side, entities);
    const other = endName(rel, side === 'a' ? 'b' : 'a', entities);
    return (
      <ControlGroup key={side} label={`${mine}s per ${other}`}>
        <Segmented label={`At most (${mine}s)`} value={end.max} onChange={(max) => patchEnd(side, { max })} options={[{ value: '1', label: 'one' }, { value: 'N', label: 'many' }]} />
        <Segmented label={`At least (${mine}s)`} value={end.min} onChange={(min) => patchEnd(side, { min })} options={[{ value: 0, label: 'zero' }, { value: 1, label: 'one' }]} />
      </ControlGroup>
    );
  };

  const fkOptions: { value: FkSide; label: string }[] = [
    { value: 'auto', label: kindOf(rel) === 'M:N' ? 'join table' : 'where it belongs' },
    { value: 'a', label: rel.roles ? `on the ${rel.roles.a} side` : `on ${nameOf(rel.a.entity).table}` },
    { value: 'b', label: rel.roles ? `on the ${rel.roles.b} side` : `on ${nameOf(rel.b.entity).table}` },
  ];

  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Tables" value={String(tables.length)} sub={joins ? `${joins} join` : undefined} />
          <Stat label="Foreign keys" value={String(fks)} color="var(--violet)" />
          <Stat label="Selected" value={kindOf(rel)} color={broken.has(rel.id) ? 'var(--bad)' : 'var(--info)'} />
          <Stat label="Problems" value={issues.length ? String(issues.length) : 'none'} color={issues.length ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'primary key' },
            { color: 'var(--violet)', label: 'foreign key' },
            { color: 'var(--info)', label: 'join table' },
            { color: 'var(--bad)', label: 'modelling error' },
          ]}
        />
      }
      controls={[
        <Segmented key="preset" label="Model" value={presetId} onChange={choosePreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} />,
        <ControlGroup key="rel" label="Relationship">
          {rels.map((r) => (
            <ChipButton key={r.id} tone={broken.has(r.id) ? 'bad' : 'info'} on={r.id === selected} onClick={() => select(r.id)}>
              {nameOf(r.a.entity).table} {r.label} {nameOf(r.b.entity).table}
            </ChipButton>
          ))}
        </ControlGroup>,
        endControls('a'),
        endControls('b'),
        <Segmented key="fk" label="Put the foreign key" value={rel.fkSide} onChange={(fkSide) => update((r) => ({ ...r, fkSide }))} options={fkOptions} />,
      ]}
    >
      <div className="stage-pad er">
        <WideRegion minWidth={CANVAS_MIN_WIDTH} label="ER diagram: scroll sideways to see all of it">
          <ErCanvas entities={entities} rels={rels} selected={selected} broken={broken} onSelect={select} />
        </WideRegion>
        <p className={`er-reading log-row ${broken.has(rel.id) ? 'tone-bad' : 'tone-info'}`}>
          <b>{kindOf(rel)}</b> {describe(rel, entities)}
        </p>
        <Box className="er-out">
          <SectionTitle>The tables this becomes</SectionTitle>
          {issues.length > 0 && (
            <ul className="er-issues">
              {issues.map((i) => <li key={i.relationship} className="log-row tone-bad">{i.text}</li>)}
            </ul>
          )}
          <TablesPanel tables={tables} />
        </Box>
      </div>
    </StageFrame>
  );
}
