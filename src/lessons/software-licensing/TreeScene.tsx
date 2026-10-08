import { useState, type ReactNode } from 'react';
import { Box, SectionTitle, Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { TreeSvg, type TreeShape } from '../../components/TreeSvg';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { badge, distributes, LICENCES, MODEL_LABEL, MODEL_NOTE, MODELS, PRODUCT_LICENCES, productLabel, type LicenceId, type Model, type ProductLicence } from './licences';
import { STATUS_TONE, STATUS_WORD } from './labels';
import { CompatChip, Disclaimer, LicenceBadge, ObligationTable } from './parts';
import {
  ALLOW_LIST, DEFAULT_PRESET, depthOf, MAX_DEPS, MAX_DEPTH, PRESETS, resolveTree, ROOT, scan, spdxCoverage, withAdded, withFlag, withLicence,
  withoutDep, type Dep, type Preset,
} from './resolver';

const W = 760;
const H = 300;
const BOX_W = 104;
const BOX_H = 50;
const TEXT_PX = 10;
const MIN_WIDTH = minWidthForText(W, TEXT_PX);

const MODEL_SHORT: Record<Model, string> = { internal: 'Internal', distributed: 'App', saas: 'SaaS', library: 'Library' };
const MODEL_OPTIONS = MODELS.map((m) => ({ value: m, label: MODEL_SHORT[m] }));

interface State {
  product: ProductLicence;
  model: Model;
  deps: Dep[];
  selected: string;
  scanner: boolean;
  policy: boolean;
}

const fromPreset = (p: Preset, keep?: Pick<State, 'scanner' | 'policy'>): State => ({
  product: p.product, model: p.model, deps: p.deps, selected: p.selected, scanner: keep?.scanner ?? false, policy: keep?.policy ?? false,
});

/** The sentence under the stage: true for whatever state the learner just made. */
function describe(s: State): ReactNode {
  const t = resolveTree(s.deps, s.product, s.model);
  const v = t.verdicts.get(s.selected);
  return (
    <>
      Shipped as <b>{MODEL_LABEL[s.model].toLowerCase()}</b>, product licence <b>{productLabel(s.product)}</b>:{' '}
      {plural(t.copyleft, 'package')} with copyleft triggered, {plural(t.conflicts, 'conflict')}, {plural(t.noPermission, 'package')} with no permission.
      {v && (
        <>
          {' '}
          <b>{v.dep.name}</b> ({badge(v.dep.licence)}): {v.headline}
        </>
      )}
    </>
  );
}

export function TreeScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState<State>(() => fromPreset(DEFAULT_PRESET));
  const [presetId, setPresetId] = useState<string | null>(null);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>
      A closed-source product shipped as an app. <span className="hl">Click a package</span>, then swap its licence: the obligations
      are recomputed from a small rule table. This is a simplified model, not legal advice.
    </>,
  );

  const change = (patch: Partial<State>) => {
    const next = { ...state, ...patch };
    setState(next);
    setPresetId(null);
    setCaption(describe(next));
  };
  const select = (id: string) => {
    const next = { ...state, selected: id };
    setState(next);
    setCaption(describe(next));
  };
  const loadPreset = (p: Preset) => {
    setState(fromPreset(p, state));
    setPresetId(p.id);
    setCaption(p.note);
  };

  const { deps, product, model, selected } = state;
  const summary = resolveTree(deps, product, model);
  const dep = deps.find((d) => d.id === selected);
  const verdict = dep ? summary.verdicts.get(dep.id) : undefined;
  const addParent = depthOf(deps, selected) < MAX_DEPTH ? selected : ROOT;
  const addParentName = deps.find((d) => d.id === addParent)?.name ?? 'your product';
  const canAdd = deps.length < MAX_DEPS;

  const shape: TreeShape<string> = { root: ROOT, children: (id) => deps.filter((d) => d.parent === id).map((d) => d.id) };
  const coverage = spdxCoverage(deps);
  const report = scan(deps, model, { scanner: state.scanner, policy: state.policy });

  const addDep = (licence: LicenceId) => {
    const added = withAdded(deps, addParent, licence);
    if (added) change({ deps: added.deps, selected: added.id });
  };
  const removeSelected = () => {
    const left = withoutDep(deps, selected);
    change({ deps: left, selected: left[0]?.id ?? ROOT });
  };

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Packages" value={deps.length} />
          <Stat label="Copyleft triggered" value={summary.copyleft} color={summary.copyleft ? 'var(--violet)' : 'var(--ok)'} />
          <Stat label="Conflicts" value={summary.conflicts} color={summary.conflicts ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="No permission" value={summary.noPermission} color={summary.noPermission ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'selected' },
            { color: 'var(--ok)', label: 'notices only' },
            { color: 'var(--violet)', label: 'copyleft triggered' },
            { color: 'var(--bad)', label: 'conflict / no licence' },
            { color: 'var(--dim)', label: 'not triggered here' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="How is it shipped?" value={model} onChange={(m) => change({ model: m })} options={MODEL_OPTIONS} />
          <Hint tone="muted">{MODEL_NOTE[model]}</Hint>
        </>,
        <ControlGroup key="presets" label="Presets" inline>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => loadPreset(p)}>
              {p.label}
            </ChipButton>
          ))}
          <ChipButton tone="info" onClick={() => loadPreset(DEFAULT_PRESET)}>
            Reset to the starting tree
          </ChipButton>
        </ControlGroup>,
        <ControlGroup key="product" label="Your product's own licence" inline>
          {PRODUCT_LICENCES.map((p) => (
            <ChipButton key={p} tone="sky" on={product === p} onStyle="solid" onClick={() => change({ product: p })}>
              {productLabel(p)}
            </ChipButton>
          ))}
          <Hint>{distributes(model) ? 'Matters where code is combined into what you hand out.' : 'Matters only if the code is handed out (or, for the AGPL, served).'}</Hint>
        </ControlGroup>,
        <ControlGroup key="add" label={`Add a package under ${addParentName}`} inline>
          {LICENCES.map((l) => (
            <ChipButton key={l} tone="amber" disabled={!canAdd} ariaLabel={`Add a package licensed ${badge(l)}`} onClick={() => addDep(l)}>
              + {badge(l)}
            </ChipButton>
          ))}
          {!canAdd && <Hint>The tree is full ({MAX_DEPS} packages).</Hint>}
        </ControlGroup>,
      ]}
    >
      <div className="sl-stage stage-pad">
        <Disclaimer />
        <WideRegion minWidth={MIN_WIDTH} label="Dependency tree: scroll sideways to see all of it">
        <TreeSvg
          shape={shape}
          layout="tidy"
          width={W}
          height={H}
          pad={BOX_W / 2 + 10}
          top={34}
          maxLevelGap={92}
          bottomRoom={50}
          ariaLabel="Dependency tree: click a package to inspect its licence obligations"
          className="sl-tree"
          onNodeClick={select}
          nodeAriaLabel={(id) => {
            const d = deps.find((x) => x.id === id);
            return d ? `${d.name}, ${badge(d.licence)}, ${STATUS_WORD[summary.verdicts.get(id)!.status]}` : `Your product, ${productLabel(product)}`;
          }}
          nodeClass={(id) => {
            const v = summary.verdicts.get(id);
            return `sl-node ${v ? `is-${v.status}` : 'is-root'} ${id === selected ? 'is-sel' : ''}`;
          }}
          renderNode={(id) => {
            const d = deps.find((x) => x.id === id);
            const tags = d ? [d.modified && 'modified', d.separate && 'separate'].filter(Boolean).join(' · ') : '';
            return (
              <>
                {id === selected && <rect className="sl-ring" x={-BOX_W / 2 - 4} y={-BOX_H / 2 - 4} width={BOX_W + 8} height={BOX_H + 8} rx={12} />}
                <rect className="sl-box" x={-BOX_W / 2} y={-BOX_H / 2} width={BOX_W} height={BOX_H} rx={9} />
                <text y={d ? -9 : -4} textAnchor="middle" className="sl-node-name">
                  {d ? d.name : 'your product'}
                </text>
                <text y={d ? 6 : 12} textAnchor="middle" className="sl-node-lic">
                  {d ? badge(d.licence) : productLabel(product)}
                </text>
                {tags && (
                  <text y={19} textAnchor="middle" className="sl-node-tag">
                    {tags}
                  </text>
                )}
              </>
            );
          }}
        />
        </WideRegion>

        <div className="sl-panels">
          <Box className="sl-detail">
            {dep && verdict ? (
              <>
                <div className="sl-detail-head">
                  <SectionTitle>Selected package</SectionTitle>
                  <b className="sl-detail-name">{dep.name}</b>
                  <LicenceBadge id={dep.licence} tone={STATUS_TONE[verdict.status]} />
                  <span className={`chip tone-${STATUS_TONE[verdict.status]}`}>{STATUS_WORD[verdict.status]}</span>
                  {verdict.compat && <CompatChip compat={verdict.compat} />}
                </div>
                <ControlGroup label="Swap its licence" inline>
                  {LICENCES.map((l) => (
                    <ChipButton key={l} tone="amber" on={dep.licence === l} onStyle="solid" onClick={() => change({ deps: withLicence(deps, dep.id, l) })}>
                      {badge(l)}
                    </ChipButton>
                  ))}
                </ControlGroup>
                <div className="sl-toggles">
                  <Toggle label="We changed its files" value={dep.modified} onChange={(v) => change({ deps: withFlag(deps, dep.id, 'modified', v) })} off="No" on="Modified" />
                  <Toggle label="How it's used" value={dep.separate} onChange={(v) => change({ deps: withFlag(deps, dep.id, 'separate', v) })} off="Built into our product" on="Separate program" />
                  <Button variant="danger" onClick={removeSelected}>
                    Remove {dep.name}
                  </Button>
                </div>
                <p className="sl-headline">{verdict.headline}</p>
                <ObligationTable rows={verdict.obligations} />
              </>
            ) : (
              <p className="sl-headline">
                <b>Your product</b> ({productLabel(product)}), shipped as {MODEL_LABEL[model].toLowerCase()}. Click one of the packages to see what its licence asks of you.
              </p>
            )}
          </Box>

          <div className="sl-side">
            <Tray stack label="Conflicts and blockers" empty="None: no conflicts, and every package has a licence.">
              {[...summary.verdicts.values()]
                .filter((v) => v.status === 'bad')
                .map((v) => (
                  <div key={v.dep.id} className="sl-issue">
                    <LicenceBadge id={v.dep.licence} tone="bad" /> <b>{v.dep.name}</b>: {v.headline}
                  </div>
                ))}
            </Tray>
            <Tray stack label="Duties triggered across the tree" empty="Nothing is triggered in this setup.">
              <div className="sl-rollup">
                {summary.rollup.map((r) => (
                  <span key={r.id} className={`chip tone-${r.id === 'no-permission' ? 'bad' : r.copyleft ? 'violet' : 'ok'}`}>
                    {r.label} ×{r.count}
                  </span>
                ))}
              </div>
            </Tray>
            <Box variant="sunken" className="sl-practices">
              <SectionTitle>What teams actually do</SectionTitle>
              <p className="sl-practice">
                <b>SPDX id in each package:</b> {coverage.have} of {coverage.total} packages carry a machine-readable identifier
                {coverage.have < coverage.total && ': the rest cannot be scanned'}.
              </p>
              <div className="sl-practice-row">
                <ChipButton tone="info" on={state.scanner} onStyle="solid" onClick={() => change({ scanner: !state.scanner })}>
                  Licence scanner in CI
                </ChipButton>
                <ChipButton tone="info" on={state.policy} onStyle="solid" onClick={() => change({ policy: !state.policy })}>
                  Allow-list policy
                </ChipButton>
              </div>
              <p className="sl-practice" aria-live="polite">
                {report.state === 'unchecked' && 'No scanner: nothing checks licences until a customer or a lawyer does.'}
                {report.state === 'report-only' &&
                  (report.flagged.length
                    ? `Scanner reports, without a policy to fail on: ${report.flagged.map((f) => `${f.dep.name} (${f.reason})`).join('; ')}.`
                    : 'Scanner lists every licence it finds. With no policy, a person has to read the list.')}
                {report.state === 'pass' && `Build passes against the example allow-list for this way of shipping (${ALLOW_LIST[model].map(badge).join(', ')}).`}
                {report.state === 'fail' && `Build fails: ${report.flagged.map((f) => `${f.dep.name} (${f.reason})`).join('; ')}.`}
              </p>
              <Hint>The allow-list is an example, not advice: yours is set by your company's policy.</Hint>
            </Box>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
