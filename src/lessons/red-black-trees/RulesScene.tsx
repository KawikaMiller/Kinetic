import { useState, type ReactNode } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { buildRb, checkRules, heightOf, recolor, shortestPath, sizeOf, blackHeights } from './model';
import { RULES_KEYS } from './presets';
import { RbTreeView } from './RbTreeView';
import { RULE_TEXT, rulesCaption } from './text';

const FILL_LEGEND = [
  { color: 'var(--pink)', label: 'red node (letter R)', shape: 'dot' },
  { color: 'var(--muted)', label: 'black node (letter B)', shape: 'dot' },
  { color: 'var(--bad)', label: 'ring: a rule is broken here', shape: 'line' },
] as const;

export function RulesScene({ picker }: { picker: ReactNode }) {
  const [tree, setTree] = useState(() => buildRb(RULES_KEYS).tree);
  const rules = checkRules(tree);
  const offenders = new Set(rules.flatMap((r) => r.nodes));
  const bh = blackHeights(tree).get(tree.root);
  const caption = rulesCaption(rules);
  useIntroCaption(<>{caption}</>, [caption]);
  const longest = heightOf(tree);
  const shortest = shortestPath(tree);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Black-height" value={bh === null || bh === undefined ? '?' : bh} sub="black nodes down any path, nil leaf counted" />
          <Stat label="Longest path" value={longest} sub={`nodes from the root; the shortest is ${shortest}`} />
          <Stat label="Nodes" value={sizeOf(tree)} />
        </Stats>
      }
      legend={<Legend items={[...FILL_LEGEND]} />}
      controls={[
        <>
          {picker}
          <Button onClick={() => setTree(buildRb(RULES_KEYS).tree)}>Reset to a valid tree</Button>
          <Hint>Press a node to flip its colour: a deliberate way to break a rule. B2 means black with black-height 2.</Hint>
        </>,
      ]}
    >
      <div className="rb-stage stage-pad rb-split">
        <div className="rb-main">
          <RbTreeView
            tree={tree}
            badge="blackHeight"
            rings={(k) => (offenders.has(k) ? 'bad' : null)}
            onNodeClick={(k) => setTree(recolor(tree, k))}
            ariaLabel={`Red-black tree of ${sizeOf(tree)} nodes; ${rules.filter((r) => !r.ok).length} rules broken`}
          />
        </div>
        <div className="rb-side">
          <Tray label="The four rules, checked from the colours and shape" labelWeight="regular" stack ariaLabel="Rule checklist">
            <ol className="rb-rules">
              {rules.map((r) => (
                <li key={r.rule} className={r.ok ? 'is-ok' : 'is-bad'}>
                  <b>{r.ok ? 'holds' : 'broken'}</b> rule {r.rule}: {RULE_TEXT[r.rule]}
                  {r.detail && <span className="rb-detail"> ({r.detail})</span>}
                </li>
              ))}
            </ol>
          </Tray>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the checklist is recomputed from the tree after every flip; nothing is typed in</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
