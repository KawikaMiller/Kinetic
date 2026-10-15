import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { ownersCaption } from './captions';
import {
  FLAG_TEAMS, MAX_PATTERN, OPENING_RULES, PATHS, PULL_REQUESTS, TEAMS, TEAM_TONE, matchesNoPath, moveRule, ownerOf, parsePattern, removeRule, review, ruleLines, setRule, unownedPaths,
  type Rule, type Team,
} from './owners';

export function OwnersScene({ picker }: { picker: ReactNode }) {
  const [rules, setRules] = useState<Rule[]>([...OPENING_RULES]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pattern, setPattern] = useState('/api/');
  const [owner, setOwner] = useState<Team | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const setCaption = useSetCaption();

  const unowned = useMemo(() => unownedPaths(rules), [rules]);
  const reviews = useMemo(() => PULL_REQUESTS.map((pr) => review(rules, pr)), [rules]);

  useEffect(() => {
    setCaption(ownersCaption(rules, unowned.length, reviews), { quiet: true });
  }, [setCaption, rules, unowned, reviews]);

  const apply = () => {
    const parsed = parsePattern(pattern);
    if (!parsed.ok) return setMessage(parsed.error);
    if (owner === null) return setMessage('Pick the team that owns it.');
    const next = setRule(rules, { pattern: parsed.pattern, owner });
    setRules(next.rules);
    setSelected(null);
    if (next.replaced) setMessage(`A rule for ${parsed.pattern} already existed, so it was replaced in place.`);
    else setMessage(matchesNoPath(parsed.pattern) ? `Added, but ${parsed.pattern} matches no path in the repository: a directory needs a trailing /.` : null);
  };
  const remove = () => {
    if (selected === null) return;
    setRules(removeRule(rules, selected));
    setSelected(null);
  };
  const move = (by: -1 | 1) => {
    if (selected === null) return;
    setRules(moveRule(rules, selected, by));
    setSelected(Math.min(rules.length - 1, Math.max(0, selected + by)));
  };

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Rules" value={rules.length} sub="last matching rule wins" />
          <Stat label="Paths with no owner" value={unowned.length} sub={`of ${PATHS.length}`} color={unowned.length ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label={`Pull requests needing ${FLAG_TEAMS} teams`} value={reviews.filter((r) => r.flagged).length} sub={`of ${reviews.length}`} color={reviews.some((r) => r.flagged) ? 'var(--orange)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...TEAMS.map((t) => ({ color: `var(--${TEAM_TONE[t]})`, label: t, shape: 'square' as const })),
            { color: 'var(--bad)', label: 'no owner', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Pattern" value={pattern} onChange={setPattern} onEnter={apply} width={170} maxLength={MAX_PATTERN} spellCheck={false} />
          <ControlGroup label="Owner">
            {TEAMS.map((t) => (
              <ChipButton key={t} tone={TEAM_TONE[t]} on={owner === t} onStyle="solid" onClick={() => setOwner(t)}>
                {t}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={apply}>Add or replace rule</Button>
        </>,
        <>
          <Button disabled={selected === null} onClick={() => move(-1)}>Move up</Button>
          <Button disabled={selected === null} onClick={() => move(1)}>Move down</Button>
          <Button disabled={selected === null} onClick={remove}>Delete rule</Button>
          {message ? <Hint tone="muted">{message}</Hint> : <Hint>Select a rule line to move or delete it. Later rules win over earlier ones.</Hint>}
        </>,
      ]}
    >
      <div className="mp stage-pad">
        <div className="mp-split">
          <div className="mp-rules">
            {rules.length ? (
              <CodePanel
                title="CODEOWNERS (simplified)"
                lines={ruleLines(rules)}
                active={selected}
                onLineClick={setSelected}
                pressed={(i) => i === selected}
                roving
                lineLabel={(i) => `Rule ${i + 1}: ${rules[i].pattern} owned by ${rules[i].owner}`}
              />
            ) : (
              <Box variant="sunken"><p className="empty-note">No rules: every path is unowned.</p></Box>
            )}
          </div>
          <Box className="mp-tree">
            <SectionTitle hint={`${PATHS.length} invented paths`}>Who owns what</SectionTitle>
            <ul className="mp-paths">
              {PATHS.map((p) => {
                const o = ownerOf(rules, p);
                return (
                  <li key={p} className={o ? '' : 'is-unowned'}>
                    <code>{p}</code>
                    <span className={`chip tone-${o ? TEAM_TONE[o] : 'bad'}`}>{o ?? 'no owner'}</span>
                  </li>
                );
              })}
            </ul>
          </Box>
        </div>

        <div className="mp-prs">
          {reviews.map((r) => (
            <Box key={r.pr.id} variant="sunken" className={`mp-pr ${r.flagged ? 'is-flagged' : ''}`}>
              <SectionTitle hint={plural(r.pr.paths.length, 'file')}>{r.pr.title}</SectionTitle>
              <div className="mp-reviewers">
                {r.teams.length ? r.teams.map((t) => <span key={t} className={`chip tone-${TEAM_TONE[t]}`}>{t}</span>) : <span className="chip tone-dim">no reviewers required</span>}
                {r.flagged && <span className="chip tone-orange">needs {FLAG_TEAMS} teams or more</span>}
              </div>
              {r.unowned.length > 0 && (
                <p className="mp-unowned">
                  No owner: {r.unowned.map((u) => <code key={u}>{u}</code>)}
                </p>
              )}
            </Box>
          ))}
        </div>

        <div className="mp-notes">
          <Provenance kind="invented">an invented repository and pull requests</Provenance>
          <Provenance kind="toy">simplified syntax: patterns are anchored at the root and use *, *.ext, a directory ending in /, or one file</Provenance>
          <ClaimLabel kind="practice">on GitHub, the last matching pattern in a CODEOWNERS file wins; one vendor's convention, not a standard</ClaimLabel>
          <Provenance kind="from-memory">check the platform's CODEOWNERS documentation before relying on it</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
