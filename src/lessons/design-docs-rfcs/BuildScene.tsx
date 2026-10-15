import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { buildCaption } from './captions';
import {
  ALTERNATIVES, COST_MAX, DEADLINE_LABEL, DECISION_LABEL, OPENING_CONTENT, READERS, askCounts, askOutcome, keptOrder, lintDoc, moveSection, readerReach, sectionOf,
  type AlternativeId, type Deadline, type Decision, type DocContent, type Reach, type SectionId,
} from './designdoc';

const MATRIX_MIN_WIDTH = 440;

function ReachCell({ read, words, reach, ask }: { read: number; words: number; reach: Reach; ask: boolean }) {
  if (reach === 'none') return <td className={`dd-cell ${ask ? 'is-bad' : 'is-dim'}`}>{ask ? 'never reached' : '–'}</td>;
  if (reach === 'full') return <td className="dd-cell is-ok">all {words}</td>;
  return <td className="dd-cell is-hi">{read} of {words}</td>;
}

export function BuildScene({ picker }: { picker: ReactNode }) {
  const [doc, setDoc] = useState<DocContent>(OPENING_CONTENT);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  /** The row and button that had focus when a move was pressed: the button may be disabled once the row has moved. */
  const refocus = useRef<{ id: SectionId; label: string | null } | null>(null);
  const setCaption = useSetCaption();
  const kept = keptOrder(doc);
  const lint = useMemo(() => lintDoc(doc), [doc]);

  useEffect(() => {
    setCaption(buildCaption(doc), { quiet: true });
  }, [setCaption, doc]);

  useEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want) return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>(`[data-section="${want.id}"] button`) ?? [])];
    // Keep focus on the pressed button; when the move disabled it, fall to the row's first button that still works.
    const target = buttons.find((b) => !b.disabled && b.getAttribute('aria-label') === want.label) ?? buttons.find((b) => !b.disabled);
    target?.focus();
  }, [doc.order]);

  const moveTo = (id: SectionId, to: number, label: string) => {
    refocus.current = { id, label };
    setDoc({ ...doc, order: moveSection(doc.order, doc.order.indexOf(id), to) });
  };
  const move = (id: SectionId, by: number, label: string) => moveTo(id, doc.order.indexOf(id) + by, label);
  const toTop = (id: SectionId, label: string) => moveTo(id, 0, label);
  const toggleKept = (id: SectionId) => setDoc({ ...doc, dropped: doc.dropped.includes(id) ? doc.dropped.filter((d) => d !== id) : [...doc.dropped, id] });
  const toggleAlt = (id: AlternativeId) =>
    setDoc({ ...doc, alternatives: doc.alternatives.some((a) => a.id === id) ? doc.alternatives.filter((a) => a.id !== id) : [...doc.alternatives, { id, cost: '' }] });
  const setCost = (id: AlternativeId, cost: string) => setDoc({ ...doc, alternatives: doc.alternatives.map((a) => (a.id === id ? { ...a, cost } : a)) });

  const drop = (to: number) => {
    if (dragFrom !== null) setDoc({ ...doc, order: moveSection(doc.order, dragFrom, to) });
    setDragFrom(null);
  };
  const dragProps = (i: number) => ({
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop: () => drop(i),
  });

  const asks = askCounts(kept);

  return (
    <StageFrame
      height={620}
      stats={
        <Stats>
          <Stat label="Readers who read the ask in full" value={`${asks.read} of ${READERS.length}`} color={asks.read === READERS.length ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Doc checks passing" value={`${lint.filter((l) => l.pass).length} of ${lint.length}`} color={lint.every((l) => l.pass) ? 'var(--ok)' : 'var(--hi)'} />
          <Stat label="Words in the doc" value={kept.reduce((s, id) => s + sectionOf(id).words, 0).toLocaleString('en-US')} sub="authored per section" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'in the table: words a reader read in full', shape: 'square' },
            { color: 'var(--hi)', label: 'in the table: cut off partway', shape: 'square' },
            { color: 'var(--dim)', label: 'in the table: not reached', shape: 'square' },
            { color: 'var(--bad)', label: 'in the table: the ask never reached', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Alternatives in the doc">
            {ALTERNATIVES.map((a) => (
              <ChipButton key={a.id} tone="info" on={doc.alternatives.some((x) => x.id === a.id)} onClick={() => toggleAlt(a.id)}>
                {a.name}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Segmented label="Decision wanted" value={doc.decision} onChange={(decision: Decision) => setDoc({ ...doc, decision })} options={Object.entries(DECISION_LABEL).map(([value, label]) => ({ value: value as Decision, label }))} />
          <Segmented label="Decide" value={doc.deadline} onChange={(deadline: Deadline) => setDoc({ ...doc, deadline })} options={Object.entries(DEADLINE_LABEL).map(([value, label]) => ({ value: value as Deadline, label }))} />
        </>,
      ]}
    >
      <div className="dd stage-pad">
        <div className="dd-split">
          <Box className="dd-sections">
            <SectionTitle hint="move with the arrows, or drag the handle">Sections, in reading order</SectionTitle>
            <ol className="dd-list" ref={list}>
              {doc.order.map((id, i) => {
                const s = sectionOf(id);
                const isKept = !doc.dropped.includes(id);
                return (
                  <li key={id} data-section={id} className={`dd-row ${isKept ? '' : 'is-dropped'}`} {...dragProps(i)}>
                    <span className="dd-handle" draggable onDragStart={() => setDragFrom(i)} onDragEnd={() => setDragFrom(null)} title="Drag to reorder" aria-hidden="true">⠿</span>
                    <span className={`chip tone-${s.tone} dd-name`}>{s.name}</span>
                    <span className="dd-words">{s.words} words</span>
                    <span className="dd-buttons">
                      <ChipButton tone="muted" ariaLabel={`Move ${s.name} to the top`} disabled={i === 0} onClick={() => toTop(id, `Move ${s.name} to the top`)}>top</ChipButton>
                      <ChipButton tone="muted" ariaLabel={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(id, -1, `Move ${s.name} up`)}>↑</ChipButton>
                      <ChipButton tone="muted" ariaLabel={`Move ${s.name} down`} disabled={i === doc.order.length - 1} onClick={() => move(id, 1, `Move ${s.name} down`)}>↓</ChipButton>
                      <ChipButton tone="info" on={isKept} ariaLabel={`Keep ${s.name} in the doc`} onClick={() => toggleKept(id)}>keep</ChipButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Box>

          <div className="dd-readers">
            {READERS.map((r) => {
              const reach = readerReach(kept, r.budget);
              const ask = askOutcome(kept, r.budget);
              return (
                <Box key={r.id} variant="sunken" className="dd-reader">
                  <SectionTitle hint={`${r.budget.toLocaleString('en-US')} words`}>{r.name}</SectionTitle>
                  <Bar
                    segments={reach.filter((x) => x.read > 0).map((x) => ({ value: x.read, tone: sectionOf(x.id).tone }))}
                    max={r.budget}
                    height={12}
                    animate={false}
                    ariaLabel={`${r.name} spends a budget of ${r.budget} words across the sections in order`}
                  />
                  <span className={`chip ${ask === 'none' ? 'tone-bad' : ask === 'cut' ? 'tone-hi' : 'tone-ok'}`}>
                    {ask === 'none' ? 'no decision reached' : ask === 'cut' ? 'decision cut off' : 'reaches the decision'}
                  </span>
                </Box>
              );
            })}
          </div>
        </div>

        <WideRegion minWidth={MATRIX_MIN_WIDTH} label="Reader reach by section: scroll sideways to see all of it">
          <table className="data-table dd-matrix">
            <thead>
              <tr>
                <th>Section</th>
                {READERS.map((r) => (
                  <th key={r.id}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kept.map((id) => (
                <tr key={id}>
                  <th scope="row">{sectionOf(id).name}</th>
                  {READERS.map((r) => {
                    const x = readerReach(kept, r.budget).find((y) => y.id === id)!;
                    return <ReachCell key={r.id} read={x.read} words={x.words} reach={x.reach} ask={id === 'recommendation'} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>

        <div className="dd-split">
          <Box className="dd-lint">
            <SectionTitle hint="computed from your arrangement and content">Doc checks</SectionTitle>
            <ul>
              {lint.map((l) => (
                <li key={l.id} className={l.pass ? 'is-pass' : 'is-fail'}>
                  <span className={`chip ${l.pass ? 'tone-ok' : 'tone-bad'}`}>{l.pass ? 'pass' : 'fix'}</span> <b>{l.label}</b>
                  <span className="dd-found">{l.found}</span>
                </li>
              ))}
            </ul>
          </Box>
          <Box className="dd-costs">
            <SectionTitle hint={`up to ${COST_MAX} characters, plain text`}>Cost of each alternative</SectionTitle>
            {doc.alternatives.length === 0 && <p className="empty-note">No alternatives listed.</p>}
            {kept.includes('alternatives') ? null : <p className="empty-note">The Alternatives section is dropped, so none of this is in the doc.</p>}
            {doc.alternatives.map((a) => (
              <TextField
                key={a.id}
                label={ALTERNATIVES.find((x) => x.id === a.id)!.name}
                value={a.cost}
                onChange={(v) => setCost(a.id, v.slice(0, COST_MAX))}
                maxLength={COST_MAX}
                spellCheck
                width={260}
              />
            ))}
          </Box>
        </div>

        <div className="dd-notes">
          <Provenance kind="invented">an invented doc, "Move session storage out of the monolith's database"; word counts and reader budgets are made up</Provenance>
          <ClaimLabel kind="practice">these nine section names are common in design docs; no organisation's template is implied</ClaimLabel>
          <ClaimLabel kind="practice">putting the ask first is common advice for readers who stop early</ClaimLabel>
          <ClaimLabel kind="view">a design doc is a record of a decision, not a specification of what was built</ClaimLabel>
          <Hint block>Readers read the kept sections in order until their budget runs out, so a section left out gives its words to the ones after it.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
