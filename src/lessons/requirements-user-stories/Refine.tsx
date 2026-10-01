import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { pct, plural } from '../../core/format';
import { popIn } from '../../core/motion';
import {
  ambiguity, criteriaFor, DEFINITION_OF_DONE, gherkin, MATERIAL, question, QUESTIONS, REQUEST, scopeFor, STORY, testsFor,
} from './model';

// Orbit geometry (viewBox units).
const VIEW_W = 640;
const VIEW_H = 250;
const CENTER = { x: 320, y: 125 };
const ORBIT = { rx: 255, ry: 98 };
const REQUEST_W = 370;
const REQUEST_H = 60;
const PILL_H = 28;
const PILL_CHAR_W = 8.6;
const PILL_PAD = 20;
const KEYWORDS = /^(\s*)(Scenario:|Given|When|Then)(.*)$/;

/** Each material question's open ambiguity gets a fixed spot on the orbit. */
const SPOT = Object.fromEntries(
  MATERIAL.map((q, i) => {
    const a = -Math.PI / 2 + (i / MATERIAL.length) * Math.PI * 2;
    return [q.id, { x: CENTER.x + ORBIT.rx * Math.cos(a), y: CENTER.y + ORBIT.ry * Math.sin(a) }];
  }),
);

export function Refine({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [asked, setAsked] = useState<string[]>([]);
  const askedSet = new Set(asked);
  const level = ambiguity(askedSet);
  const criteria = criteriaFor(asked);
  const scope = scopeFor(asked);
  const tests = testsFor(asked);
  const last = asked.at(-1) ?? null;
  const open = MATERIAL.filter((q) => !askedSet.has(q.id));
  const done = level === 0;

  useIntroCaption(<>A one-line request lands in the backlog. Every red bubble is a question nobody has answered yet. Ask the questions that change what <b>done</b> means.</>);

  const ask = (id: string) => {
    if (askedSet.has(id)) return;
    const q = question(id);
    const next = [...asked, id];
    setAsked(next);
    const remaining = MATERIAL.filter((m) => !next.includes(m.id)).length;
    if (q.kind === 'irrelevant') {
      setCaption(<>Product owner: <i>"{q.answer}"</i> The meter doesn't move: the answer doesn't change what done means.</>);
    } else if (remaining === 0) {
      setCaption(<><span className="hl ok">No ambiguity left.</span> {plural(criteriaFor(next).length, 'acceptance criterion', 'acceptance criteria')} became {plural(testsFor(next).length, 'test')}, and {plural(scopeFor(next).length, 'thing')} {scopeFor(next).length === 1 ? 'is' : 'are'} explicitly out of scope. Everyone agrees what done means.</>);
    } else {
      setCaption(
        <>Product owner: <i>"{q.answer}"</i> → {q.kind === 'criterion'
          ? <span className="hl ok">acceptance criterion</span>
          : <span className="hl violet">out of scope</span>}. {remaining} open.</>,
      );
    }
  };

  const reset = () => {
    setAsked([]);
    setCaption(<>Back to the vague request. Ask again.</>);
  };

  const lines = criteria.flatMap(gherkin);
  const newestStart = last && question(last).kind === 'criterion' ? lines.length - 4 : -1;

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Open questions" value={`${open.length}/${MATERIAL.length}`} color={done ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Criteria" value={criteria.length} color="var(--ok)" sub="Given / When / Then" />
          <Stat label="Out of scope" value={scope.length} color="var(--dim)" />
          <Stat label="Tests" value={tests.length} color="var(--info)" sub="one per criterion" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button onClick={reset} disabled={asked.length === 0}>Start over</Button>
        </>,
        <Hint key="note" block>Scripted scenario: the product owner's answers are fixed, and the questions are a curated deck.</Hint>,
      ]}
    >
      <div className="rq-stage">
        <div className="rq-left">
          <Bar value={level} max={1} tone={level > 0.5 ? 'bad' : level > 0 ? 'hi' : 'ok'} height={10}
            label={<>Ambiguity: <b>{pct(level)}</b> {done && '(nothing left to guess)'}</>} />
          <svg className="rq-orbit" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={`The request, with ${open.length} open questions around it`}>
            <ellipse cx={CENTER.x} cy={CENTER.y} rx={ORBIT.rx} ry={ORBIT.ry} className="rq-orbit-path" />
            <rect x={CENTER.x - REQUEST_W / 2} y={CENTER.y - REQUEST_H / 2} width={REQUEST_W} height={REQUEST_H} rx={14} className={`rq-request ${done ? 'is-done' : ''}`} />
            <text x={CENTER.x} y={CENTER.y + 5} textAnchor="middle" className="rq-request-text">{REQUEST}</text>
            <AnimatePresence>
              {open.map((q, i) => {
                const at = SPOT[q.id];
                const w = q.ambiguity.length * PILL_CHAR_W + PILL_PAD;
                return (
                  <motion.g key={q.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.3 }} style={{ originX: `${at.x}px`, originY: `${at.y}px` }}>
                    <g className="rq-bubble" style={{ animationDelay: `${(i % 4) * -0.7}s` }}>
                      <rect x={at.x - w / 2} y={at.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} className="rq-bubble-box" />
                      <text x={at.x} y={at.y + 5.5} textAnchor="middle" className="rq-bubble-text">{q.ambiguity}</text>
                    </g>
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </svg>
          <div className="rq-deck" role="group" aria-label="Clarifying questions">
            {QUESTIONS.map((q) => {
              const isAsked = askedSet.has(q.id);
              const kind = isAsked ? `is-${q.kind}` : '';
              return (
                <button key={q.id} type="button" className={`rq-q ${kind} ${q.id === last ? 'is-last' : ''}`} onClick={() => ask(q.id)} aria-pressed={isAsked}>
                  <span className="rq-q-text">{q.text}</span>
                  {isAsked && <span className="rq-q-tag">{q.kind === 'criterion' ? '→ criterion' : q.kind === 'scope' ? '→ out of scope' : 'no effect'}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rq-right">
          <Tray className="rq-tray" label="Acceptance criteria" empty="none yet: ask a question">
            {lines.length > 0 && (
              <CodePanel lines={lines} gutter="none" className="rq-gherkin"
                stateOf={(i) => (newestStart >= 0 && i >= newestStart ? 'now' : 'idle')}
                renderLine={(line) => {
                  const m = KEYWORDS.exec(line);
                  return m ? <>{m[1]}<span className="rq-kw">{m[2]}</span>{m[3]}</> : line;
                }} />
            )}
          </Tray>
          <Tray className="rq-tray" label="Out of scope" empty="nothing ruled out yet">
            {scope.length > 0 && (
              <ul className="rq-scope">
                {scope.map((s) => <motion.li key={s} {...popIn}>{s}</motion.li>)}
              </ul>
            )}
          </Tray>
          <Tray className="rq-tray" label="Test checklist" empty="tests appear as criteria do">
            {tests.length > 0 && (
              <ul className="rq-tests">
                {tests.map((t) => <motion.li key={t} {...popIn} className="chip tone-info">☐ {t}</motion.li>)}
              </ul>
            )}
          </Tray>
        </div>
        <AnimatePresence>
          {done && (
            <motion.div className="rq-done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Box>
                <SectionTitle>The user story</SectionTitle>
                <p className="rq-story">
                  As <b>{STORY.asA}</b>, I want <b>{STORY.iWant}</b>, so that <b>{STORY.soThat}</b>.
                </p>
                <SectionTitle>Definition of done</SectionTitle>
                <div className="rq-dod">
                  {DEFINITION_OF_DONE.map((d) => <span key={d} className="chip tone-ok">✓ {d}</span>)}
                </div>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StageFrame>
  );
}
