import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, plural } from '../../core/format';
import { PUBLISHED } from './deps';
import { explainMatch, explainRange, maxSatisfying, parseVersion } from '../../core/semver';


const PRESETS = ['^1.4.2', '~1.4.2', '1.x', '>=1.2 <2', '^0.3.1', '1.4.2', '^1.5.0-beta.1', '*'];

/** What each number promises. Below 1.0.0 (initial development) MINOR carries the breaking changes. */
function parts(major: number) {
  return [
    { name: 'MAJOR', role: major === 0 ? '0 = initial development' : 'breaking change', tone: 'bad' },
    { name: 'MINOR', role: major === 0 ? 'breaking, while MAJOR is 0' : 'new feature', tone: 'info' },
    { name: 'PATCH', role: 'bug fix', tone: 'ok' },
  ] as const;
}

const CARET = /^\^\s*v?(\d+)(?:\.(\d+))?/;

function rangeHint(range: string): ReactNode {
  const r = range.trim();
  const caret = CARET.exec(r);
  if (caret) {
    const [major, minor] = [Number(caret[1]), Number(caret[2] ?? 0)];
    if (major > 0) return <>Caret: MINOR and PATCH may move up; MAJOR is locked.</>;
    if (minor > 0) return <>Caret on 0.x: only PATCH may move up. The leftmost non-zero number is locked.</>;
    return <>Caret on 0.0.x: nothing may move. It means exactly that version.</>;
  }
  if (r.startsWith('~')) return <>Tilde: only PATCH may move up.</>;
  if (r === '*' || r === '') return <>Anything goes. Great for surprises.</>;
  return null;
}

export function RangeTester({ picker }: { picker: ReactNode }) {
  const [range, setRange] = useState('^1.4.2');
  const [focus, setFocus] = useState<string | null>(null);
  const setCaption = useSetCaption();
  const meaning = explainRange(range);
  const picked = maxSatisfying(PUBLISHED, range);
  const matches = PUBLISHED.filter((v) => explainMatch(v, range) === 'match');
  const shown = focus ?? picked ?? '1.4.2';
  const anatomy = parseVersion(shown)!;

  useIntroCaption(
    <>
      A range in <code>package.json</code> is a rule, not a version. <span className="hl">^1.4.2</span> accepts 1.9.0 but
      not 2.0.0: it never crosses a MAJOR. Try the presets, or type your own.
    </>,
  );

  const pickVersion = (ver: string) => {
    setFocus(ver);
    const why = explainMatch(ver, range);
    setCaption(
      why === 'match' ? (
        <>
          <span className="hl ok">{ver}</span> satisfies <code>{range}</code>
          {ver === picked ? <>, and it's the highest match, so npm installs it.</> : <>, but npm installs the highest match: {picked}.</>}
        </>
      ) : why === 'prerelease' ? (
        <>
          <span className="hl">{ver}</span> is inside the bounds but it's a <b>pre-release</b>. npm only picks one when the
          range itself names a pre-release of {ver.split('-')[0]}.
        </>
      ) : (
        <>
          <span className="hl bad">{ver}</span> is outside <code>{range}</code>
          {meaning ? <> (which means {meaning})</> : null}.
        </>
      ),
    );
  };

  const setRangeAndSay = (next: string) => {
    setRange(next);
    setFocus(null);
    const m = explainRange(next);
    const best = maxSatisfying(PUBLISHED, next);
    setCaption(
      m === null ? (
        <>That isn't a valid range, so nothing matches.</>
      ) : (
        <>
          <code>{next}</code> means <span className="hl violet">{m}</span>.{' '}
          {best ? <>npm would install <span className="hl">{best}</span>.</> : <>Nothing published matches.</>}
        </>
      ),
      { quiet: true },
    );
  };

  return (
    <StageFrame
      height={300}
      stats={
        <Stats>
          <Stat label="Matching versions" value={matches.length} color="var(--ok)" sub={`of ${PUBLISHED.length} published`} />
          <Stat label="npm installs" value={picked ?? NA} color="var(--hi)" sub="the highest match" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'installed (highest match)' },
            { color: 'var(--ok)', label: 'satisfies the range' },
            { color: 'var(--dim)', label: 'excluded' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets">
            {PRESETS.map((p) => (
              <ChipButton key={p} tone="violet" on={p === range} onClick={() => setRangeAndSay(p)}>
                {p}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Range" value={range} onChange={setRangeAndSay} width={200} spellCheck={false} />
          <Hint>{meaning === null ? 'not a valid range' : rangeHint(range) ?? 'click any version to see why'}</Hint>
        </>,
      ]}
    >
      <div className="dm-range stage-pad">
        <p className="dm-meaning">
          <code>{range || '""'}</code> <span className="dm-arrow">means</span>{' '}
          <code className="dm-desugar">{meaning ?? 'invalid'}</code>
          {meaning?.includes('-0') && <span className="dm-note"> (a trailing -0 also shuts out that version's pre-releases)</span>}
        </p>
        <div className="dm-versions" aria-label="Published versions of tiny-date">
          {PUBLISHED.map((ver) => {
            const why = explainMatch(ver, range);
            const state = ver === picked ? 'is-picked' : why === 'match' ? 'is-match' : 'is-out';
            return (
              <button key={ver} type="button" className={`dm-ver ${state} ${ver === shown ? 'is-focus' : ''}`} onClick={() => pickVersion(ver)}>
                {ver}
                {ver.includes('-') && <span className="dm-pre">pre</span>}
              </button>
            );
          })}
        </div>
        <Box className="dm-anatomy">
          <SectionTitle hint={`${plural(matches.length, 'match', 'matches')} · click a version`}>Anatomy of {shown}</SectionTitle>
          <div className="dm-parts">
            {parts(anatomy.major).map((p, i) => (
              <div key={p.name} className={`dm-part tone-${p.tone}`}>
                <b>{[anatomy.major, anatomy.minor, anatomy.patch][i]}</b>
                <span>{p.name}</span>
                <em>{p.role}</em>
              </div>
            ))}
            {anatomy.pre.length > 0 && (
              <div className="dm-part tone-hi">
                <b>-{anatomy.pre.join('.')}</b>
                <span>PRE-RELEASE</span>
                <em>not stable yet</em>
              </div>
            )}
          </div>
        </Box>
      </div>
    </StageFrame>
  );
}
