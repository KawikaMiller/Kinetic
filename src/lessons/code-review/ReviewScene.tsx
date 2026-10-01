import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import type { Tone } from '../../core/tone';
import { ADDED_LINES, DIFF, FILE_COUNT, scoreReview, type Comment, type Score, type Severity, type Verdict } from './review';

const SEVERITIES: { value: Severity; label: string; tone: Tone; hint: string }[] = [
  { value: 'blocking', label: 'Blocking', tone: 'bad', hint: 'must fix before merging' },
  { value: 'suggestion', label: 'Suggestion', tone: 'info', hint: 'worth doing, author decides' },
  { value: 'nit', label: 'Nit', tone: 'dim', hint: 'tiny, optional' },
];
const TONE_OF: Record<Severity, Tone> = { blocking: 'bad', suggestion: 'info', nit: 'dim' };

export function ReviewScene({ picker }: { picker: ReactNode }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const setCaption = useSetCaption();

  useIntroCaption(
    <>
      You're the reviewer. This PR adds paginated order history. Click a line, tag your comment <b>Blocking</b>,{' '}
      <b>Suggestion</b> or <b>Nit</b>, then submit. There are real bugs in here.
    </>,
  );

  const commentOn = (line: number) => comments.find((c) => c.line === line);
  const tag = (severity: Severity) => {
    if (selected === null) return;
    const rest = comments.filter((c) => c.line !== selected);
    const same = commentOn(selected)?.severity === severity;
    setComments(same ? rest : [...rest, { line: selected, severity }]);
    setScore(null);
  };
  const submit = () => {
    const s = scoreReview(comments);
    setScore(s);
    setCaption(summary(s));
  };
  const reset = () => {
    setComments([]);
    setScore(null);
    setSelected(null);
    setCaption(<>Fresh review. Read the whole diff before you comment: bugs hide in lines that look fine.</>);
  };
  const verdictOn = (line: number) => score?.verdicts.find((v) => v.issue.line === line);
  const noiseOn = (line: number) => score?.noise.some((c) => c.line === line);

  return (
    <StageFrame
      minWidth={560}
      height={520}
      stats={
        <Stats>
          <Stat label="Your comments" value={comments.length} color="var(--hi)" />
          <Stat label="Bugs caught" value={score ? `${score.bugsFound}/${score.bugsTotal}` : '?'} color={score ? (score.bugsFound === score.bugsTotal ? 'var(--ok)' : 'var(--bad)') : 'var(--muted)'} sub="after you submit" />
          <Stat label="Noise" value={score ? score.noise.length : '?'} color="var(--muted)" sub="comments that weren't issues" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected line' },
            { color: 'var(--bad)', label: 'blocking' },
            { color: 'var(--info)', label: 'suggestion' },
            { color: 'var(--dim)', label: 'nit' },
            { color: 'var(--ok)', label: 'issue you found' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <ControlGroup label={selected === null ? 'Click a line first' : `Comment on line ${selected}`}>
            {SEVERITIES.map((s) => (
              <ChipButton key={s.value} size="md" tone={s.tone} on={selected !== null && commentOn(selected)?.severity === s.value} onClick={() => tag(s.value)} title={s.hint}>
                {s.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button variant="primary" onClick={submit}>
            Submit review
          </Button>
          <Button onClick={reset}>Reset</Button>
          <Hint>Click a tag again to remove your comment.</Hint>
        </>,
      ]}
    >
      <div className="crv stage-pad">
        <Box variant="sunken" className="crv-pr">
          <SectionTitle hint={`+${ADDED_LINES} lines · ${FILE_COUNT} files`}>Pull request 412 · Add paginated order history</SectionTitle>
          <p>Adds getOrderHistory() for the new account page. Tested locally.</p>
        </Box>
        <ol className="crv-diff" aria-label="Diff">
          {DIFF.map((line, i) => (
            <li key={i}>
              {line.kind === 'file' ? (
                <span className="crv-file">{line.text}</span>
              ) : (
                <button
                  type="button"
                  className={lineClass(i, selected, commentOn(i), verdictOn(i), noiseOn(i))}
                  onClick={() => setSelected(i)}
                  aria-pressed={selected === i}
                >
                  <span className="crv-no">{i}</span>
                  <span className="crv-sign">{line.kind === 'add' ? '+' : ' '}</span>
                  <code>{line.text || ' '}</code>
                  <LineTag comment={commentOn(i)} verdict={verdictOn(i)} noise={!!noiseOn(i)} />
                </button>
              )}
            </li>
          ))}
        </ol>
        {score && <Results score={score} />}
      </div>
    </StageFrame>
  );
}

function lineClass(i: number, selected: number | null, comment: Comment | undefined, verdict: Verdict | undefined, noise: boolean | undefined) {
  return [
    'crv-line',
    selected === i && 'is-selected',
    comment && `tone-${TONE_OF[comment.severity]} has-comment`,
    verdict?.status === 'found' && !verdict.issue.linterJob && 'is-found',
    verdict?.status === 'missed' && !verdict.issue.linterJob && 'is-missed',
    noise && 'is-noise',
  ]
    .filter(Boolean)
    .join(' ');
}

function LineTag({ comment, verdict, noise }: { comment?: Comment; verdict?: Verdict; noise: boolean }) {
  // Style issues are a linter's job: flagging one is noise, and skipping it is right.
  if (verdict?.issue.linterJob) return comment ? <span className="crv-tag tone-dim">noise: a linter's job</span> : null;
  if (verdict?.status === 'missed') return <span className="crv-tag is-missed">missed: {verdict.issue.label}</span>;
  if (verdict?.status === 'found') return <span className="crv-tag is-found">✓ {verdict.issue.label}</span>;
  if (verdict?.status === 'wrong-severity') return <span className="crv-tag is-close">found, but {verdict.issue.accept[0]}</span>;
  if (!comment) return null;
  return <span className={`crv-tag tone-${TONE_OF[comment.severity]}`}>{noise ? `${comment.severity} · noise` : comment.severity}</span>;
}

function Results({ score }: { score: Score }) {
  return (
    <Box className="crv-results">
      <SectionTitle>The answer key</SectionTitle>
      <ul>
        {score.verdicts.map((v) => (
          <li key={v.issue.id} className={v.issue.linterJob ? 'is-linter' : `is-${v.status}`}>
            <b>
              Line {v.issue.line} · {v.issue.label}
            </b>{' '}
            <span className="crv-key">{v.issue.linterJob ? '(leave it to the linter)' : `(${v.issue.accept.join(' or ')})`}</span>
            <p>{v.issue.explain}</p>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function summary(s: Score): ReactNode {
  const linter = s.verdicts.find((v) => v.issue.linterJob && v.comment);
  if (s.bugsFound === s.bugsTotal) {
    return (
      <>
        <span className="hl ok">All {s.bugsTotal} bugs caught</span>
        {s.noise.length ? <>, with {plural(s.noise.length, 'comment')} that weren't really issues.</> : ' and no noise.'}{' '}
        {linter ? 'The semicolon is a linter\'s job, not yours.' : 'Nice review.'}
      </>
    );
  }
  return (
    <>
      <span className="hl bad">{s.bugsTotal - s.bugsFound} of {s.bugsTotal} bugs missed.</span>{' '}
      {linter ? 'You spotted the semicolon, though. A linter would have caught that for free: spend your attention on behaviour.' : 'Check the answer key below, then Reset and try again.'}
    </>
  );
}
