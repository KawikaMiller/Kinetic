import { Box, SectionTitle } from '../../components/Panel';
import { SIGHTINGS, type PatternId } from './model';

/** Where each pattern shows up in real code; the current one is highlighted. */
export function Recognise({ current }: { current: PatternId }) {
  return (
    <Box variant="sunken" className="csp-recognise">
      <SectionTitle hint="simplified sketches">Recognise it</SectionTitle>
      <ul>
        {SIGHTINGS.map((s) => (
          <li key={s.pattern} className={s.pattern === current ? 'is-current' : ''}>
            <b>{s.pattern}</b> <span>{s.where}</span> <code>{s.code}</code>
          </li>
        ))}
      </ul>
    </Box>
  );
}
