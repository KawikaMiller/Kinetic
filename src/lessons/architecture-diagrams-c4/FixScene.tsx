import { useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { toneVar } from '../../core/tone';
import { fixCaption, fixIntro } from './captions';
import { BAD, FIX_IDS, FIX_LABELS, applyFixes, checklist, kindsIn, score, type FixId } from './diagram';
import { BOX, FIX_AT, FIX_TITLE, FIX_VIEW } from './layout';
import { BoxText, EdgeLabel } from './BoxText';
import { KIND_LABEL, KIND_TONE, kindMark } from './kinds';
import { MIN_WIDTH } from './stage-size';

const ARROW_SIZE = 6;

export function FixScene({ picker }: { picker: ReactNode }) {
  const [fixes, setFixes] = useState<ReadonlySet<FixId>>(new Set());
  const setCaption = useSetCaption();
  useIntroCaption(fixIntro(BAD));

  const d = applyFixes(fixes);
  const items = checklist(d);
  const total = items.length;
  const done = score(d);

  const toggle = (id: FixId) => {
    const on = !fixes.has(id);
    const next = new Set(fixes);
    if (on) next.add(id);
    else next.delete(id);
    setFixes(next);
    setCaption(fixCaption(id, on, applyFixes(next)));
  };
  const reset = () => {
    setFixes(new Set());
    setCaption(fixIntro(BAD));
  };

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={540}
      stats={
        <Stats>
          <Stat label="Readability" value={`${done} of ${total}`} color={done === total ? 'var(--ok)' : 'var(--orange)'} sub="checks passed, computed from the diagram" />
          <Stat label="Arrows with intent and protocol" value={`${d.edges.filter((e) => e.intent && e.protocol).length} of ${d.edges.length}`} />
          <Stat label="Boxes deeper than level 2" value={d.elements.filter((e) => e.level > d.level).length} color={d.elements.some((e) => e.level > d.level) ? 'var(--orange)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'check still failing', shape: 'square' },
            { color: 'var(--ok)', label: 'check passes', shape: 'square' },
            { color: 'var(--muted)', label: 'box with no stated type', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <div key="f" className="c4-fixes">
          <span className="c4-fixes-label">Fixes</span>
          {FIX_IDS.map((id) => (
            <ChipButton key={id} tone="ok" on={fixes.has(id)} onStyle="solid" onClick={() => toggle(id)}>
              {FIX_LABELS[id]}
            </ChipButton>
          ))}
          <ChipButton tone="muted" onClick={reset}>
            Reset
          </ChipButton>
        </div>,
      ]}
    >
      <div className="c4 stage-pad">
        <div className="c4-canvas">
          <svg className="c4-backdrop" viewBox={`0 0 ${FIX_VIEW.w} ${FIX_VIEW.h}`} aria-hidden="true">
            <text x={FIX_TITLE.x} y={FIX_TITLE.y} className={d.title ? 'c4-diagram-title' : 'c4-diagram-title is-missing'}>
              {d.title ?? '(no title)'}
            </text>
          </svg>
          <GraphView
            nodes={d.elements.map((e) => ({ id: e.id, at: FIX_AT[e.id], shape: 'box' as const, label: '' }))}
            edges={d.edges.map((e) => ({
              from: e.from,
              to: e.to,
              label: e.intent || e.protocol ? <EdgeLabel intent={e.intent} protocol={e.protocol} /> : undefined,
            }))}
            directed
            width={FIX_VIEW.w}
            height={FIX_VIEW.h}
            box={BOX}
            arrowSize={ARROW_SIZE}
            nodeMark={(id) => kindMark(d.elements.find((e) => e.id === id)?.kind ?? null)}
            renderNode={(n, at, base) => {
              const e = d.elements.find((x) => x.id === n.id)!;
              return (
                <>
                  {base}
                  <BoxText at={at} name={e.name} tech={e.tech} kind={e.kind} />
                </>
              );
            }}
            className="c4-graph"
            ariaLabel={`Diagram ${d.title ?? 'with no title'}: ${d.edges.map((e) => `${e.from} to ${e.to}${e.intent ? `, ${e.intent}` : ', unlabelled'}`).join('; ')}`}
          />
        </div>
        {d.legend ? (
          <Legend
            items={[
              ...kindsIn(d).map((k) => ({ color: toneVar(KIND_TONE[k]), label: KIND_LABEL[k], shape: 'square' as const })),
              { color: 'var(--line-2)', label: 'arrow: who uses whom, with its protocol in brackets', shape: 'line' as const },
            ]}
          />
        ) : (
          <p className="c4-nokey">No key: what do the shapes and colours mean?</p>
        )}
        <div className="c4-checklist" role="list" aria-label="Readability checklist">
          <SectionTitle weight="regular">Readability checklist</SectionTitle>
          {FIX_IDS.map((id) => {
            const item = items.find((c) => c.id === id)!;
            return (
              <div key={id} role="listitem" className={`c4-check ${item.ok ? 'is-ok' : 'is-open'}`}>
                <span className="c4-check-mark" aria-hidden="true">
                  {item.ok ? '✓' : '○'}
                </span>
                <span className="c4-check-text">
                  <b>{FIX_LABELS[id]}</b>
                  <span className="c4-check-detail">{item.detail}</span>
                </span>
                <span className="c4-check-state">{item.ok ? 'fixed' : 'to fix'}</span>
              </div>
            );
          })}
        </div>
        <Hint block>
          A made-up diagram of the same made-up system. The checklist is computed from the diagram's own properties (each arrow's label, each box's level and type,
          whether a title and a key exist), not from which chips are ticked. Real teams also tailor these checks, and a fully ticked list is a floor, not a guarantee
          the diagram is good.
        </Hint>
      </div>
    </StageFrame>
  );
}
