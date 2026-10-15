import { motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { SPRING } from '../../core/motion';
import { toneVar } from '../../core/tone';
import { audienceCaption, audienceNote, levelCaption, noDeeperLevel } from './captions';
import { BOX, VIEWS, boxRect, edgeKey, type Rect } from './layout';
import {
  AUDIENCES, AUDIENCE_IDS, FOCUS, LEVELS, LEVEL_NAMES, dimming, elementOf, frameTitle, isZoomable, viewAt, type AudienceId, type Level,
} from './model';
import { BoxText, EdgeLabel } from './BoxText';
import { KIND_LABEL, KIND_TONE, kindMark } from './kinds';
import { MIN_WIDTH, VIEW_W } from './stage-size';

const NODE_ENTER = { opacity: 0, scale: 0.88 };
const NODE_SHOWN = { opacity: 1, scale: 1 };
const FADE_S = 0.35;
const ARROW_SIZE = 6;
const FRAME_RX = 12;

const rectAttrs = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

export function ZoomScene({ picker }: { picker: ReactNode }) {
  const [level, setLevel] = useState<Level>(1);
  const [audienceId, setAudienceId] = useState<AudienceId>('all');
  /** The box the learner clicked to get here: the frame grows out of it. */
  const [from, setFrom] = useState<Rect | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(levelCaption(1));

  const audience = AUDIENCES[audienceId];
  const view = useMemo(() => viewAt(level), [level]);
  const layout = VIEWS[level];
  const dim = dimming(audience, level);
  const shown = [...view.children, ...view.surroundings];
  const kinds = [...new Set(shown.map((e) => e.kind))];

  const go = (next: Level, aud: AudienceId = audienceId, origin: Rect | null = null) => {
    setLevel(next);
    setFrom(origin);
    setCaption(levelCaption(next) + audienceNote(AUDIENCES[aud], next));
  };
  const chooseAudience = (id: AudienceId) => {
    const a = AUDIENCES[id];
    setAudienceId(id);
    if (a.level === null || a.level === level) {
      setCaption(a.level === null ? audienceCaption(a) : levelCaption(level) + audienceNote(a, level));
      return;
    }
    setLevel(a.level);
    setFrom(null);
    setCaption(audienceCaption(a));
  };
  const open = (id: string) => {
    if (!isZoomable(id)) {
      setCaption(noDeeperLevel(id));
      return;
    }
    go((elementOf(id).level + 1) as Level, audienceId, boxRect(layout.at[id]));
  };

  const stars = (l: Level) => (audience.level === l ? ' ★' : '');
  const frame = layout.frame;
  const withProtocol = view.relations.filter((r) => r.protocol).length;
  const audienceLine =
    audience.level === null
      ? audience.question
      : `${audience.label}: "${audience.question}" This lesson pairs it with level ${audience.level}, ${LEVEL_NAMES[audience.level]}.${audience.level === level ? '' : ` This level has ${level > audience.level ? 'more' : 'less'} detail than that.`}`;

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={540}
      stats={
        <Stats>
          <Stat label="Zoom level" value={`${level} · ${LEVEL_NAMES[level]}`} color="var(--hi)" sub={view.focus ? `inside ${elementOf(view.focus).name}` : 'the whole system from outside'} />
          <Stat label="Boxes in this zoom" value={view.children.length} sub={`exactly the children of ${view.focus ? elementOf(view.focus).name : 'the world'}`} />
          <Stat label="Arrows" value={view.relations.length} sub={`${withProtocol} name a protocol`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...kinds.map((k) => ({ color: toneVar(KIND_TONE[k]), label: KIND_LABEL[k], shape: 'square' as const })),
            ...(frame ? [{ color: 'var(--hi)', label: 'dashed: the box you zoomed into', shape: 'line' as const }] : []),
            { color: 'var(--line-2)', label: 'arrow: who uses whom', shape: 'line' as const },
            { color: 'var(--text)', label: '+ : can be zoomed into', shape: 'dot' as const },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented<Level>
            label="Zoom"
            value={level}
            onChange={(l) => go(l)}
            options={LEVELS.map((l) => ({ value: l, label: `${l} ${LEVEL_NAMES[l]}${stars(l)}` }))}
          />
          <Segmented<AudienceId> label="Audience" value={audienceId} onChange={chooseAudience} options={AUDIENCE_IDS.map((id) => ({ value: id, label: AUDIENCES[id].label }))} />
        </>,
      ]}
    >
      <div className="c4 stage-pad">
        <nav className="c4-crumbs" aria-label="Zoom path">
          {LEVELS.filter((l) => l <= level).map((l, i) => (
            <span key={l} className="c4-crumb-item">
              {i > 0 && <span aria-hidden="true">›</span>}
              <button type="button" className={`c4-crumb ${l === level ? 'is-current' : ''}`} aria-current={l === level ? 'step' : undefined} onClick={() => go(l)}>
                {LEVEL_NAMES[l]}
                {FOCUS[l] ? `: ${elementOf(FOCUS[l]!).name}` : ''}
              </button>
            </span>
          ))}
        </nav>
        <div className={`c4-canvas ${dim.whole ? 'is-dim' : ''} ${dim.tech ? 'hide-tech' : ''} ${dim.protocol ? 'hide-protocol' : ''}`}>
          <motion.div key={level} className="c4-graph-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: FADE_S, delay: from ? 0.15 : 0 }}>
            <GraphView
              nodes={shown.map((e) => ({ id: e.id, at: layout.at[e.id], shape: 'box' as const, label: '' }))}
              edges={view.relations.map((r) => ({
                from: r.from,
                to: r.to,
                label: <EdgeLabel intent={r.intent} protocol={r.protocol} />,
                labelAt: layout.labelAt[edgeKey(r)],
              }))}
              directed
              labelHalo
              underlay={
                <>
                  {frame && view.focus && (
                    <g key={view.focus}>
                      <motion.rect
                        className="c4-frame"
                        rx={FRAME_RX}
                        initial={from ? { ...rectAttrs(from), opacity: 1 } : { ...rectAttrs(frame), opacity: 0 }}
                        animate={{ ...rectAttrs(frame), opacity: 1 }}
                        transition={SPRING.soft}
                      />
                      <motion.text
                        className="c4-frame-title"
                        x={frame.title.x}
                        y={frame.title.y}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: from ? 0.25 : 0, duration: FADE_S }}
                      >
                        {frameTitle(view.focus)}
                      </motion.text>
                    </g>
                  )}
                </>
              }
              width={VIEW_W}
              height={layout.h}
              box={BOX}
              arrowSize={ARROW_SIZE}
              nodeMark={(id) => kindMark(elementOf(id).kind)}
              onNodeClick={open}
              nodeAriaLabel={(id) => {
                const e = elementOf(id);
                return `${e.name}, ${KIND_LABEL[e.kind]}${e.tech ? `, ${e.tech}` : ''}${isZoomable(id) ? ', press Enter to zoom in' : ''}`;
              }}
              renderNode={(n, at, base) => {
                const e = elementOf(String(n.id));
                return (
                  <motion.g initial={NODE_ENTER} animate={NODE_SHOWN} transition={SPRING.soft} className="c4-node-enter">
                    {base}
                    <BoxText at={at} name={e.name} tech={e.tech} kind={level === 1 ? e.kind : null} zoomable={isZoomable(e.id)} />
                  </motion.g>
                );
              }}
              className="c4-graph"
              ariaLabel={`${LEVEL_NAMES[level]} diagram${view.focus ? ` of ${elementOf(view.focus).name}` : ''}: ${view.relations.map((r) => `${elementOf(r.from).name} to ${elementOf(r.to).name}, ${r.intent}`).join('; ')}`}
            />
          </motion.div>
        </div>
        <p className="c4-audience" aria-live="off">
          {audienceLine}
        </p>
        <Hint block>
          A made-up system. The four diagrams are views of one nested model: every box here is an element in it, and a zoom shows exactly the children of the box
          you opened. C4 does not prescribe a notation: boxes and labelled arrows are enough, so the colours and shapes are this lesson's own.
          {level === 2 && ' A C4 "container" is a separately running thing (a web app, a database, a queue), not necessarily a Docker container.'}
          {level >= 3 && ' Components and code are optional zoom-ins: Brown suggests levels 1 and 2 are enough for most teams, and the code level is usually generated or skipped.'}
          {audience.level !== null && ' Pairing an audience with one level is a rule of thumb of this lesson, not part of C4. The guidance from Simon Brown is looser: a context diagram suits technical and non-technical readers alike.'}
        </Hint>
      </div>
    </StageFrame>
  );
}
