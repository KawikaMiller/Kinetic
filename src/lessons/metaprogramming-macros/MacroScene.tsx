import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { STRATEGY_LABEL, macroCaption } from './captions';
import { EXPANSION_LIMIT, type Strategy } from './expand';
import { MAX_CALL_CHARS, MAX_DEFINITION_CHARS, type Node } from './macroLang';
import { MACRO_PRESETS, OPENING } from './opening';
import { A_MAX, A_MIN, CALLER_TMP, reasons, runMacro, valueText, type RunResult } from './run';
import { useMacroInput } from './useMacroInput';

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'tree', label: 'Syntax tree' },
  { value: 'hygienic', label: 'Hygienic' },
];
const PILL_W = 76;
const PILL_H = 24;
const TREE_W = 420;
const TREE_H = 250;
const TREE_MIN_WIDTH = 380;
const STRATEGY_ORDER: Strategy[] = ['text', 'tree', 'hygienic'];

const nodeLabel = (n: Node) => (n.kind === 'let' ? `let ${n.text}` : n.text);

/** Scene 1: expand a macro call three ways and evaluate the result. */
export function MacroScene({ picker }: { picker: ReactNode }) {
  const input = useMacroInput(OPENING.macro.preset);
  const [strategy, setStrategy] = useState<Strategy>(MACRO_PRESETS.find((p) => p.id === OPENING.macro.preset)!.strategy);
  const [a, setA] = useState(OPENING.macro.a);
  const runs = useMemo(
    () => Object.fromEntries(STRATEGY_ORDER.map((s) => [s, runMacro(s, input.def, input.call.tokens, input.call.tree, a)])) as Record<Strategy, RunResult>,
    [input.def, input.call, a],
  );
  const run = runs[strategy];
  const tree = run.expanded.ok ? run.expanded.tree : null;
  const nodes = useMemo(() => {
    const map = new Map<number, Node>();
    const walk = (n: Node) => {
      map.set(n.id, n);
      n.kids.forEach(walk);
    };
    if (tree) walk(tree);
    return map;
  }, [tree]);
  const evaluation = run.evaluated;
  const calls = evaluation && evaluation.ok ? evaluation.nextCalls : 0;
  const damage = reasons(run);
  const consoleLines = [
    ...(evaluation ? [evaluation.ok ? `value = ${evaluation.value}` : { text: `error: ${evaluation.error}`, tone: 'bad' as const }] : []),
    ...(calls > 0 ? [{ text: `next() was called ${calls} ${calls === 1 ? 'time' : 'times'}: it returned ${Array.from({ length: calls }, (_, i) => i + 1).join(', ')}`, tone: 'info' as const }] : []),
    ...damage.map((d) => ({ text: d, tone: 'bad' as const })),
  ];

  return (
    <StageFrame
      height={640}
      intro={macroCaption({ strategy, call: input.callSource, run, a })}
      introKey={`${strategy}|${input.definitionSource}|${input.callSource}|${a}`}
      stats={
        <Stats>
          <Stat label="Result" value={run.expanded.ok ? valueText(evaluation) : 'not expanded'} color={evaluation && evaluation.ok ? (damage.length ? 'var(--bad)' : 'var(--hi)') : 'var(--bad)'} sub={`a = ${a}, tmp = ${CALLER_TMP}`} />
          <Stat label="Counter reads" value={calls} color="var(--info)" sub="how often next() ran" />
          <Stat label="Expansions" value={run.expanded.ok ? `${run.expanded.expansions} of ${EXPANSION_LIMIT}` : `limit ${EXPANSION_LIMIT}`} color={run.expanded.ok ? 'var(--muted)' : 'var(--orange)'} sub="macro calls replaced" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'from the caller', shape: 'square' },
            { color: 'var(--violet)', label: 'from the template', shape: 'square' },
            { color: 'var(--bad)', label: 'captured or regrouped wrongly', shape: 'square' },
            { color: 'var(--ok)', label: 'renamed binder (hygiene)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Examples">
            {MACRO_PRESETS.map((p) => (
              <ChipButton
                key={p.id}
                tone="info"
                on={input.presetId === p.id}
                onClick={() => {
                  input.loadPreset(p);
                  setStrategy(p.strategy);
                }}
              >
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="Expansion" value={strategy} onChange={setStrategy} options={STRATEGIES} />
          <Slider label="a" value={a} min={A_MIN} max={A_MAX} onChange={setA} />
        </>,
        <>
          <TextField label={`Macro (template up to 60 characters)`} value={input.definitionText} onChange={input.setDefinition} width={300} spellCheck={false} maxLength={MAX_DEFINITION_CHARS + 20} />
          <TextField label="Call" value={input.callText} onChange={input.setCall} width={200} spellCheck={false} maxLength={MAX_CALL_CHARS + 20} />
          <Hint tone="muted" block>
            <span role="status" className="mm-status">
              {input.definitionError ? <span className="mm-error">Macro: {input.definitionError} The last good macro stays.</span> : null}
              {input.callError ? <span className="mm-error"> Call: {input.callError} The last good call stays.</span> : null}
            </span>
          </Hint>
        </>,
      ]}
    >
      <div className="mm-stage stage-pad">
        <div className="mm-two">
          <CodePanel title="Source" lines={[input.definitionSource, input.callSource]} stateOf={(i) => (i === 1 ? 'now' : 'idle')} />
          <CodePanel
            title={`After expansion: ${STRATEGY_LABEL[strategy].toLowerCase()}`}
            lines={[run.source ?? '(not expanded)']}
            stateOf={() => (run.expanded.ok ? 'add' : 'bad')}
            renderLine={(line) =>
              run.printed && run.marks ? (
                <span className="mm-line">
                  {run.printed.map((t, i) => (
                    <span key={i} className={`mm-tok tone-${run.marks!.get(t.node) ?? 'muted'}`}>
                      {t.text}{' '}
                    </span>
                  ))}
                </span>
              ) : (
                line
              )
            }
          />
        </div>
        {tree ? (
          <>
            <SectionTitle>The expanded tree</SectionTitle>
            <WideRegion minWidth={TREE_MIN_WIDTH} label="Expanded tree: scroll sideways to see all of it">
              <TreeSvg
                shape={{ root: tree.id, children: (id) => nodes.get(id)?.kids.map((k) => k.id) ?? [] }}
                layout="tidy"
                width={TREE_W}
                height={TREE_H}
                natural
                nodeSize={() => 1.5}
                ariaLabel={`Expanded tree of ${run.source}`}
                renderNode={(id) => {
                  const n = nodes.get(id)!;
                  return (
                    <g className={`mm-pill tone-${run.marks?.get(id) ?? 'muted'}`}>
                      <rect x={-PILL_W / 2} y={-PILL_H / 2} width={PILL_W} height={PILL_H} rx={8} />
                      <text y={4} textAnchor="middle">
                        {nodeLabel(n)}
                      </text>
                    </g>
                  );
                }}
              />
            </WideRegion>
          </>
        ) : null}
        <ConsolePanel title="evaluation" lines={consoleLines} empty="nothing evaluated" />
        <table className="data-table mm-compare">
          <caption>The same call, three ways, at a = {a}</caption>
          <thead>
            <tr>
              <th>Expansion</th>
              <th>Expands to</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {STRATEGY_ORDER.map((s) => (
              <tr key={s} className={s === strategy ? 'is-current' : ''}>
                <td>{STRATEGY_LABEL[s]}</td>
                <td>
                  <code>{runs[s].source ?? 'stopped at the limit or refused'}</code>
                </td>
                <td>{runs[s].expanded.ok ? valueText(runs[s].evaluated) : 'no value'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mm-note">Generated code is what a debugger sees, so an expansion has to stay inspectable: that is why the expansion is shown as source here.</p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">a toy expression language and a small macro system: your text is read by a hand-written parser and walked by a small evaluator, never run</Provenance>
        <Provenance kind="from-memory">Lisp defmacro is not hygienic (programmers use gensym), Scheme syntax-rules is, Rust macro_rules! is hygienic for local variables, the C preprocessor is not: check each language reference</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
