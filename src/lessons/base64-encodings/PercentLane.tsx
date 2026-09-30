import { useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ControlGroup, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { PERCENT_PRESETS, percentEncode, percentTokens, type PercentMode } from './model';

const MAX_LENGTH = 30;

export function PercentLane({ lanePicker }: { lanePicker: ReactNode }) {
  const [text, setText] = useState(PERCENT_PRESETS[0].text);
  const [mode, setMode] = useState<PercentMode>('component');

  const tokens = percentTokens(text, mode);
  const output = percentEncode(text, mode);

  useIntroCaption(
    <>URLs can only carry a small set of safe characters. Anything else is sent as its UTF-8 bytes, each written{' '}
      <code>%XX</code>. Space is <code>%20</code> in a URL but <code>+</code> in an HTML form.</>,
  );

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Characters in" value={[...text].length} />
          <Stat label="Escaped" value={tokens.filter((t) => t.changed).length} color="var(--hi)" />
          <Stat label="Characters out" value={output.length} color="var(--info)" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--hi)', label: 'escaped as %XX (its UTF-8 bytes)' }, { color: 'var(--dim)', label: 'safe, sent as-is' }]} />}
      controls={[
        <>
          {lanePicker}
          <TextField label="Type text" value={text} onChange={setText} maxLength={MAX_LENGTH} width={220} spellCheck={false} />
          <Segmented
            label="Encode for"
            value={mode}
            onChange={setMode}
            options={[{ value: 'component', label: 'a URL part (encodeURIComponent)' }, { value: 'form', label: 'a form (URLSearchParams)' }]}
          />
        </>,
        <ControlGroup key="presets" label="Try">
          {PERCENT_PRESETS.map((p) => (
            <button key={p.label} type="button" className={`chip tone-violet b64-preset ${text === p.text ? 'is-on' : ''}`} onClick={() => setText(p.text)}>
              {p.label}
            </button>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad b64">
        <div className="b64-tokens">
          {tokens.map((t, i) => (
            <span key={i} className={`b64-token ${t.changed ? 'is-escaped' : ''}`}>
              <span className="b64-token-in">{t.char === ' ' ? '␠' : t.char}</span>
              <span className="b64-token-out">{t.out}</span>
            </span>
          ))}
        </div>
        <div className="b64-output">
          <SectionTitle hint={mode === 'component' ? 'same as encodeURIComponent(text)' : 'same as new URLSearchParams({ q: text })'}>Result</SectionTitle>
          <code className="b64-string">{output || '(empty)'}</code>
        </div>
      </div>
    </StageFrame>
  );
}
