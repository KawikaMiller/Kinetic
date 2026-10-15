import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, Segmented, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { contractJson, makeContract, type MatcherType } from './contract';
import { consumerCaption } from './captions';
import { MATCHERS, START_CHOICE } from './choices';
import { DEFAULT_CONSUMER, FIELDS, consumerLines, coverage, matcherFits, type ConsumerOptions, type Field } from './consumer';

export function ContractScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [options, setOptions] = useState<ConsumerOptions>(DEFAULT_CONSUMER);
  const [chosen, setChosen] = useState<Partial<Record<Field, MatcherType>>>(START_CHOICE);

  const caption = useMemo(() => consumerCaption(options, chosen), [options, chosen]);
  useEffect(() => {
    setCaption(caption, { quiet: true });
  }, [caption, setCaption]);

  const named = Object.keys(chosen) as Field[];
  const { missing, extra } = coverage(named, options);
  const contract = makeContract(chosen as Record<string, MatcherType>);
  const toggle = (f: Field) =>
    setChosen((c) => {
      const next = { ...c };
      if (next[f]) delete next[f];
      else next[f] = 'any';
      return next;
    });

  return (
    <StageFrame
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'named in the contract' },
            { color: 'var(--dim)', label: 'not named' },
            { color: 'var(--ok)', label: 'the page survives the matcher' },
            { color: 'var(--bad)', label: 'it would break the page' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="The page shows the email" value={options.showEmail} onChange={(showEmail) => setOptions((o) => ({ ...o, showEmail }))} off="no" on="yes" />
          <Toggle label="The page shows the plan" value={options.showPlan} onChange={(showPlan) => setOptions((o) => ({ ...o, showPlan }))} off="no" on="yes" />
        </>,
      ]}
    >
      <div className="stage-pad ct">
        <div className="ct-pair">
          <CodePanel title="The consumer (checkout-web) reads, in its own code" lines={consumerLines(options)} gutter="none" />
          <Box className="ct-card">
            <SectionTitle weight="regular" hint="tick what it reads, then pick a matcher">Fields of GET /users/42</SectionTitle>
            <ul className="ct-fields">
              {FIELDS.map((f) => {
                const m = chosen[f];
                const fit = m ? matcherFits(f, m, options) : null;
                return (
                  <li key={f} className="ct-frow">
                    <ChipButton tone={m ? 'info' : 'dim'} on={!!m} onClick={() => toggle(f)}>{f}</ChipButton>
                    {m && (
                      <>
                        <Segmented ariaLabel={`Matcher for ${f}`} value={m} onChange={(v) => setChosen((c) => ({ ...c, [f]: v }))} options={MATCHERS} />
                        {fit && <span className={`chip tone-${fit.fits ? 'ok' : 'bad'} wrap`}>{fit.fits ? 'the page survives it' : `breaks on ${JSON.stringify(fit.breaksOn!.value)}: ${fit.breaksOn!.error}`}</span>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </Box>
        </div>

        <div className="ct-pair">
          <CodePanel title="The contract file (a simplified format, not Pact's)" lines={contractJson(contract)} gutter="none" />
          <Box className="ct-card">
            <SectionTitle weight="regular">Does it cover what the page reads?</SectionTitle>
            {missing.length === 0 && extra.length === 0 && <span className="chip tone-ok">exactly what the page reads</span>}
            {missing.map((f) => <span key={f} className="chip tone-bad wrap">{f}: read by the page, not in the contract</span>)}
            {extra.map((f) => <span key={f} className="chip tone-info wrap">{f}: in the contract, never read</span>)}
            <p className="muted">A field the page reads but the contract leaves out can be removed with every test green. A field in the contract that nobody reads stops a provider from removing something no one needs.</p>
          </Box>
        </div>
        <div className="ct-chips">
          <Provenance kind="toy">a simplified contract format inspired by Pact; real tools do more</Provenance>
          <Provenance kind="real">the page is real code: the fields it reads are recorded by running it</Provenance>
        </div>
        <Hint block>The contract holds matchers and never values, so the provider is not tied to sample data.</Hint>
      </div>
    </StageFrame>
  );
}
