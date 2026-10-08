import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import type { Tone } from '../../core/tone';
import { DETAILS, READERS, VERSIONS, explainFit, fitOf, keptBy, readerOf, type ReaderId, type Version } from './readers';

type Matches = Partial<Record<Version['id'], ReaderId>>;

/** Readers are plain categories, so they take the categorical tones, not ok/bad. */
const READER_TONE: Record<ReaderId, Tone> = { exec: 'amber', peer: 'pink', sre: 'sky' };

export function ReadersScene({ picker }: { picker: ReactNode }) {
  const [matches, setMatches] = useState<Matches>({});
  const setCaption = useSetCaption();
  useIntroCaption(<>One change, three versions written for different readers (all fictional). Say who each version is for; the table shows which details each one kept.</>);

  const assigned = VERSIONS.filter((v) => matches[v.id]);
  const fits = assigned.filter((v) => fitOf(v, matches[v.id]!).fits).length;
  const sameReader = (id: Version['id'], r: ReaderId) => VERSIONS.some((v) => v.id !== id && matches[v.id] === r);

  const choose = (v: Version, r: ReaderId) => {
    const same = matches[v.id] === r;
    setMatches({ ...matches, [v.id]: same ? undefined : r });
    if (same) {
      setCaption(<>Took the reader off version {v.id}.</>);
      return;
    }
    setCaption(
      <>
        Version {v.id} for the {readerOf(r).label.toLowerCase()}. {explainFit(fitOf(v, r), r)}
      </>,
    );
  };

  return (
    <StageFrame
      height={460}
      controls={[
        <>
          {picker}
          <Button onClick={() => { setMatches({}); setCaption(<>Cleared: no version has a reader yet.</>); }}>Clear</Button>
        </>,
      ]}
      stats={
        <Stats>
          <Stat label="Versions matched" value={`${assigned.length} of ${VERSIONS.length}`} />
          <Stat label="That fit" value={assigned.length === 0 ? 'none yet' : `${fits} of ${assigned.length}`} />
        </Stats>
      }
    >
      <div className="tw-stage stage-pad">
        <Box variant="sunken">
          <SectionTitle hint="fictional change">The change: card-payment retries</SectionTitle>
          <ul className="tw-readers" aria-label="The three readers">
            {READERS.map((r) => (
              <li key={r.id} className={`tw-reader tone-${READER_TONE[r.id]}`}>
                <b>{r.label}</b> <span>{r.situation}</span>
              </li>
            ))}
          </ul>
        </Box>

        <div className="tw-versions">
          {VERSIONS.map((v) => {
            const reader = matches[v.id];
            const fit = reader ? fitOf(v, reader) : null;
            return (
              <Box key={v.id} className="tw-version">
                <SectionTitle>Version {v.id}</SectionTitle>
                <p className="tw-text">{v.text}</p>
                <div className="tw-chip-row" role="group" aria-label={`Who is version ${v.id} for?`}>
                  {READERS.map((r) => (
                    <ChipButton key={r.id} tone={READER_TONE[r.id]} on={reader === r.id} onStyle="solid" onClick={() => choose(v, r.id)}>
                      {r.label}
                    </ChipButton>
                  ))}
                </div>
                {fit && reader && (
                  <p className={`tw-note ${fit.fits ? 'is-ok' : 'is-bad'}`}>
                    {explainFit(fit, reader)}
                    {sameReader(v.id, reader) && ' Another version already has this reader: each version here was written for a different one.'}
                  </p>
                )}
              </Box>
            );
          })}
        </div>

        <Box>
          <SectionTitle hint="columns are versions A, B and C, read off their text">What each version kept</SectionTitle>
          <table className="data-table tw-matrix">
            <thead>
              <tr>
                <th>Detail</th>
                {VERSIONS.map((v) => (
                  <th key={v.id} aria-label={`Version ${v.id}`}>{v.id}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DETAILS.map((d) => (
                <tr key={d.id}>
                  <td data-label="Detail">
                    <b>{d.label}</b> <span className="tw-fact-text">{d.fact}</span>
                  </td>
                  {VERSIONS.map((v) => {
                    const kept = keptBy(v).includes(d.id);
                    return (
                      <td key={v.id} data-label={`Version ${v.id}`} className={kept ? 'tw-kept' : 'tw-dropped'}>
                        {kept ? 'kept' : 'dropped'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Hint block>
          Fictional change and made-up numbers. Which details each reader needs is a judgement call: your own readers may need different ones, and the best way to know is to ask them.
        </Hint>
      </div>
    </StageFrame>
  );
}
