import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { badge, LICENCE_FACTS, LICENCES, MODEL_LABEL, MODELS, PRODUCT_LICENCES, productLabel, RULES, type LicenceId, type Model } from './licences';
import { CompatChip, Disclaimer } from './parts';
import { compatibility, compatNote, compatSource, obligationRows } from './resolver';

const MODEL_SHORT: Record<Model, string> = { internal: 'Internal tool', distributed: 'Distributed app', saas: 'SaaS', library: 'Library' };

function describe(licence: LicenceId): ReactNode {
  const f = LICENCE_FACTS[licence];
  return (
    <>
      <b>{badge(licence)}</b> ({f.family}): {f.blurb}
    </>
  );
}

export function RulesScene({ picker }: { picker: ReactNode }) {
  const [licence, setLicence] = useState<LicenceId>('Apache-2.0');
  const [modified, setModified] = useState(false);
  const [separate, setSeparate] = useState(false);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>
      The rule table behind the resolver. Pick a licence to see what each way of shipping triggers, and which product licences it can
      be combined into. Simplified for learning, not legal advice.
    </>,
  );

  const pick = (l: LicenceId) => {
    setLicence(l);
    setCaption(describe(l));
  };
  const facts = LICENCE_FACTS[licence];
  const rows = RULES[licence];
  const cell = (id: string, model: Model) => obligationRows(licence, { model, modified, separate }).find((o) => o.id === id)!;

  return (
    <StageFrame
      height={380}
      controls={[
        <>
          {picker}
          <ControlGroup label="Licence" inline>
            {LICENCES.map((l) => (
              <ChipButton key={l} tone="amber" on={licence === l} onStyle="solid" onClick={() => pick(l)}>
                {badge(l)}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Toggle label="We changed its files" value={modified} onChange={setModified} off="No" on="Modified" />
          <Toggle label="How it's used" value={separate} onChange={setSeparate} off="Built into our product" on="Separate program" />
          <Hint>These two change some rows (state-changes, MPL files, AGPL §13, replace-the-library, whole work).</Hint>
        </>,
      ]}
    >
      <div className="sl-stage stage-pad">
        <Disclaimer />
        <Box className="sl-card">
          <div className="sl-detail-head">
            <SectionTitle>{facts.name}</SectionTitle>
            <span className="chip tone-muted">{badge(licence)}</span>
            <span className="chip tone-violet">{facts.family}</span>
          </div>
          <p className="sl-headline">{facts.blurb}</p>
        </Box>

        <Box>
          <SectionTitle hint="what each way of shipping triggers">Licence × how it's shipped</SectionTitle>
          <table className="data-table sl-matrix-table">
            <thead>
              <tr>
                <th>Obligation</th>
                {MODELS.map((m) => (
                  <th key={m}>{MODEL_SHORT[m]}</th>
                ))}
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Obligation">
                    <b>{r.label}</b>
                  </td>
                  {MODELS.map((m) => {
                    const c = cell(r.id, m);
                    return (
                      <td key={m} data-label={MODEL_LABEL[m]}>
                        <span className={`chip tone-${c.state === 'due' ? (r.id === 'no-permission' ? 'bad' : r.copyleft ? 'violet' : 'ok') : c.state === 'info' ? 'info' : 'dim'}`}>
                          {c.state === 'due' ? 'due' : c.state === 'info' ? 'applies' : 'not triggered'}
                        </span>
                      </td>
                    );
                  })}
                  <td data-label="Source" className="sl-source">
                    {r.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {licence === 'none' && <Hint block>Being public is not permission: the default is all rights reserved.</Hint>}
        </Box>

        <Box>
          <SectionTitle hint={`if ${badge(licence)} code goes into one combined work that is handed out`}>Compatibility is one-way</SectionTitle>
          <table className="data-table sl-compat-table">
            <thead>
              <tr>
                <th>Product licence</th>
                <th>Verdict</th>
                <th>Why</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCT_LICENCES.map((p) => (
                <tr key={p}>
                  <td data-label="Product licence">
                    <b>{productLabel(p)}</b>
                  </td>
                  <td data-label="Verdict">
                    <CompatChip compat={compatibility(licence, p)} />
                  </td>
                  <td data-label="Why">{compatNote(licence, p)}</td>
                  <td data-label="Source" className="sl-source">
                    {compatSource(licence, p)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>

        <Box>
          <SectionTitle hint="rows: the dependency's licence · columns: your product's">The whole table</SectionTitle>
          <WideRegion minWidth={560} label="Compatibility matrix: scroll sideways to see all of it">
            <table className="data-table sl-grid-table">
              <thead>
                <tr>
                  <th>Code under</th>
                  {PRODUCT_LICENCES.map((p) => (
                    <th key={p}>{productLabel(p)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LICENCES.map((l) => (
                  <tr key={l} className={l === licence ? 'is-picked' : ''}>
                    <th scope="row">{badge(l)}</th>
                    {PRODUCT_LICENCES.map((p) => (
                      <td key={p}>
                        <CompatChip compat={compatibility(l, p)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
          <Hint block>
            "or later" matters: GPL-2.0-or-later code can be used under GPL-3.0, which is how many projects avoid the GPL-2.0-only clash.
            Dual-licensing (the same code under two licences) and contributor agreements (CLA/DCO) are not modelled.
          </Hint>
        </Box>
      </div>
    </StageFrame>
  );
}
