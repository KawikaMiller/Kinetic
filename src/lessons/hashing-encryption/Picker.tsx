import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Controls, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { answer, SCENARIOS, score, TOOL_IDS, TOOLS, type Tool } from './pickerModel';

export function Picker({ modePicker }: { modePicker: ReactNode }) {
  const [answers, setAnswers] = useState<(Tool | null)[]>(() => SCENARIOS.map(() => null));
  const setCaption = useSetCaption();
  const right = score(answers);

  useIntroCaption(<>Six real jobs. For each one, pick the right tool. Wrong picks tell you what to ask yourself.</>);

  const pick = (i: number, t: Tool) => {
    const next = answer(answers, i, t);
    if (next === answers) return;
    setAnswers(next);
    const s = SCENARIOS[i];
    setCaption(
      t === s.a ? (
        <>
          <span className="hl ok">✓ {TOOLS[t]}</span> {s.why}
        </>
      ) : (
        <>
          <span className="hl bad">✗ Not {TOOLS[t][0].toLowerCase() + TOOLS[t].slice(1)}.</span> Ask: do you need the data <b>back</b>? Who holds the key?
        </>
      ),
    );
  };

  return (
    <StageFrame
      height={400}
      stats={
        <Stats>
          <Stat label="Correct" value={`${right}/${SCENARIOS.length}`} color={right === SCENARIOS.length ? 'var(--ok)' : 'var(--hi)'} />
        </Stats>
      }
      controls={
        <Controls>
          {modePicker}
          <Button
            onClick={() => {
              setAnswers(SCENARIOS.map(() => null));
              setCaption(<>Fresh board. For each job, pick the right tool.</>);
            }}
          >
            Reset
          </Button>
        </Controls>
      }
    >
      <div className="he-picker">
        <p className="he-picker-rule">
          <b>Need the original back?</b> → encryption. <b>Only need to check it?</b> → hashing. <b>Need to prove who sent it?</b> → signature.
        </p>
        <div className="he-picker-grid">
          {SCENARIOS.map((s, i) => {
            const a = answers[i];
            const ok = a === s.a;
            return (
              <div key={i} className={`he-scn ${a ? (ok ? 'ok' : 'bad') : ''}`}>
                <p>{s.q}</p>
                <div className="he-scn-opts">
                  {/* Every option looks the same until it's picked: green if right, red if wrong. */}
                  {TOOL_IDS.map((t) => (
                    <ChipButton
                      key={t}
                      tone={a === t && ok ? 'ok' : 'bad'}
                      on={a === t}
                      onStyle="solid"
                      className={ok && a !== t ? 'he-scn-locked' : ''}
                      onClick={() => pick(i, t)}
                    >
                      {TOOLS[t]}
                    </ChipButton>
                  ))}
                </div>
                <AnimatePresence>
                  {ok && (
                    <motion.span className="he-scn-done" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}>
                      ✓
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </StageFrame>
  );
}
