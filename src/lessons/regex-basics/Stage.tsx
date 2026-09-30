import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextArea, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { categorical } from '../../core/palette';
import { FLAGS, PRESETS, captureNames, stripSentinels, tokenize, type FlagId, type Preset } from './model';
import { TIMEOUT_MS, useRegexAnalysis } from './useRegexAnalysis';
import { GroupsTable, HighlightedText, TokenList } from './views';
import './styles.css';

type Mode = 'match' | 'replace';

const FLAG_INFO: Record<FlagId, { title: string; caption: string }> = {
  g: { title: 'global: every match, not just the first', caption: 'g (global): find every match instead of stopping at the first.' },
  i: { title: 'ignore case', caption: 'i: letters match regardless of case, so [a-z] also matches capitals.' },
  m: { title: 'multiline: ^ and $ match at each line', caption: 'm (multiline): ^ and $ now match at the start and end of every line, not just the whole text.' },
  s: { title: 'dotAll: . also matches line breaks', caption: 's (dotAll): . now matches line breaks too.' },
};

const FIRST = PRESETS[0];
/** Groups past this many still get their colours; the legend just stops listing them. */
const LEGEND_GROUPS = 4;

export function Stage() {
  const [pattern, setPattern] = useState(FIRST.pattern);
  const [flags, setFlags] = useState<FlagId[]>(FIRST.flags);
  const [text, setText] = useState(FIRST.text);
  const [mode, setMode] = useState<Mode>('match');
  const [replacement, setReplacement] = useState('$<day>/$<month>/$<year>');
  const [loaded, setLoaded] = useState<string | null>(FIRST.id);
  const [hovered, setHovered] = useState<number | null>(null);
  const setCaption = useSetCaption();

  useIntroCaption(
    <>A regex describes a shape of text. Every highlight below comes from JavaScript's real regex engine; the list explains each
      piece of the pattern. Hover a piece to see exactly what it matched.</>,
  );

  const { status, analysis } = useRegexAnalysis({ pattern, flags, text, replacement: mode === 'replace' ? replacement : undefined });
  const tokens = tokenize(pattern, flags);
  const names = captureNames(pattern);
  const run = analysis?.run;
  const matches = status === 'ready' && run?.ok ? run.matches : [];
  const error = status === 'ready' && run && !run.ok ? run.error : null;
  const hover = hovered !== null ? (analysis?.hits[hovered] ?? []) : [];

  const load = (p: Preset) => {
    setPattern(p.pattern);
    setFlags(p.flags);
    setText(p.text);
    setLoaded(p.id);
    setHovered(null);
    setMode(p.replacement !== undefined ? 'replace' : 'match');
    if (p.replacement !== undefined) setReplacement(p.replacement);
    setCaption(p.caption);
  };

  const toggleFlag = (f: FlagId) => {
    const on = !flags.includes(f);
    setFlags(on ? [...flags, f] : flags.filter((x) => x !== f));
    setLoaded(null);
    setCaption(<>{FLAG_INFO[f].caption} It's now <span className="hl">{on ? 'on' : 'off'}</span>.</>);
  };

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLoaded(null);
  };

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Matches" value={status === 'ready' && run?.ok ? `${matches.length}${run.capped ? '+' : ''}` : '–'} color="var(--hi)" />
          <Stat label="Capture groups" value={names.length} color="var(--info)" />
          <Stat label="Flags" value={`/${flags.join('') || '–'}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'whole match' },
            ...names.slice(0, LEGEND_GROUPS).map((_, k) => ({ color: categorical(k), label: `group ${k + 1}`, shape: 'dot' as const })),
            { color: 'var(--info)', label: 'what the hovered piece matched', shape: 'line' as const },
            ...(mode === 'replace' ? [{ color: 'var(--ok)', label: 'replaced text' }] : []),
            { color: 'var(--bad)', label: 'invalid or too slow' },
          ]}
        />
      }
      controls={[
        <>
          <TextField
            label="Pattern"
            value={pattern}
            onChange={edit(setPattern)}
            spellCheck={false}
            className={`rx-pattern ${error ? 'is-bad' : ''}`}
            ariaLabel="Regular expression pattern"
          />
          <ControlGroup label="Flags" className="rx-flags">
            {FLAGS.map((f) => (
              <ChipButton key={f} size="md" tone="info" on={flags.includes(f)} title={FLAG_INFO[f].title} onClick={() => toggleFlag(f)}>
                {f}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: 'match', label: 'Match' }, { value: 'replace', label: 'Replace' }]} />
          {mode === 'replace' && (
            <TextField label="Replace with" value={replacement} onChange={setReplacement} spellCheck={false} className="rx-replacement" />
          )}
        </>,
        <TextArea key="text" label="Test text" value={text} onChange={edit(setText)} sanitize={stripSentinels} rows={5} className="rx-textarea" />,
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.id} size="md" on={loaded === p.id} onClick={() => load(p)}>
              {p.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad rx">
        <Box className="rx-pattern-box">
          <SectionTitle hint="hover or focus a piece">The pattern, piece by piece</SectionTitle>
          {pattern === '' ? <Hint block>Type a pattern below.</Hint> : <TokenList tokens={tokens} hovered={hovered} onHover={setHovered} />}
          <Hint block className="rx-flavour">
            Explanations cover common syntax; flavours differ (JavaScript shown; PCRE, Python and POSIX vary).
          </Hint>
        </Box>

        {error && (
          <p className="rx-error" role="alert">
            Not a valid pattern: {error}
          </p>
        )}
        {status === 'slow' && (
          <p className="rx-error" role="alert">
            Stopped after {TIMEOUT_MS / 1000} s. Nested repeats like <code>(a+)+</code> can make the engine try exponentially many
            ways to match (catastrophic backtracking, see Tier 3 "ReDoS"). Real servers get taken down by patterns like this.
          </p>
        )}

        <Box className="rx-result">
          <SectionTitle hint={status === 'ready' && run?.ok ? `${plural(matches.length, 'match', 'matches')}${run.capped ? ' (showing the first 200)' : ''}` : undefined}>
            Test text
          </SectionTitle>
          <HighlightedText text={text} matches={matches} hover={hover} />
          {mode === 'replace' && analysis?.replaced?.ok && (
            <>
              <SectionTitle hint="text.replaceAll(pattern, replacement)">After replacing</SectionTitle>
              <pre className="rx-text">
                {analysis.replaced.parts.map((p, i) => (
                  <span key={i} className={p.replaced ? 'rx-replaced' : undefined}>
                    {p.text}
                  </span>
                ))}
              </pre>
            </>
          )}
        </Box>

        {matches.length > 0 && names.length > 0 && <GroupsTable matches={matches} groupCount={names.length} names={names} />}

        <Box variant="sunken" className="rx-when-not">
          <SectionTitle>When not to use a regex</SectionTitle>
          <ul>
            <li>HTML, JSON and other nested formats: use a real parser (see the data-formats lesson).</li>
            <li>Anything with nesting or balanced brackets: regexes can't count levels.</li>
            <li>Strict validation (emails, URLs): check loosely, then confirm for real, e.g. by sending a message.</li>
          </ul>
        </Box>
      </div>
    </StageFrame>
  );
}
