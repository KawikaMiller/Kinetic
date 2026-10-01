import { Box, SectionTitle } from '../../components/Panel';
import { looseEqualityLines } from './model';

/** The toy eqeqeq rule's pattern, as shown on screen. */
const PATTERN = '/(^|[^=!<>])(==|!=)(?!=)/';

/** Split a line around its first loose == / != so the match can be highlighted. */
function splitMatch(line: string): [string, string, string] | null {
  const m = /(^|[^=!<>])(==|!=)(?!=)/.exec(line);
  if (!m) return null;
  const at = m.index + m[1].length;
  return [line.slice(0, at), m[2], line.slice(at + m[2].length)];
}

/** A peek at one lint rule: a pattern matched against each line. */
export function RulePeek({ lines }: { lines: readonly string[] }) {
  const hits = looseEqualityLines(lines);
  return (
    <Box variant="sunken" className="sa-peek">
      <SectionTitle hint="a rule matches a pattern in the code">Inside one lint rule: eqeqeq</SectionTitle>
      <code className="sa-pattern">{PATTERN}</code>
      {hits.map((i) => {
        const parts = splitMatch(lines[i]);
        return (
          parts && (
            <code key={i} className="sa-match">
              line {i + 1}: {parts[0].trim()} <mark>{parts[1]}</mark> {parts[2].trim()}
            </code>
          )
        );
      })}
      <p className="sa-peek-note">
        This toy rule matches text. Real ESLint first parses the code into a syntax tree, so it isn't fooled by strings or
        comments (Tier 2). An inline disable comment doesn't stop the match, it tells the linter not to report it.
      </p>
    </Box>
  );
}
