/** Every number the lesson text quotes, computed from the model. */
import { EXPANSION_LIMIT } from './expand';
import { parseCall, parseMacroDef } from './macroLang';
import { MACRO_PRESETS } from './opening';
import { MISTAKES, TECHNIQUES, runPipeline } from './phases';
import { BASE, PROBES, generate, handWritten, objectWith, probe, reflective } from './reflection';
import { runMacro } from './run';

const preset = (id: string) => MACRO_PRESETS.find((p) => p.id === id)!;
const result = (id: string, strategy: 'text' | 'tree' | 'hygienic', a = 4) => {
  const p = preset(id);
  const d = parseMacroDef(p.definition);
  const c = parseCall(p.call);
  if (!d.ok || !c.ok) throw new Error(id);
  return runMacro(strategy, d.value, c.tokens, c.tree, a);
};
const value = (r: ReturnType<typeof result>) => (r.evaluated && r.evaluated.ok ? r.evaluated.value : NaN);
const calls = (r: ReturnType<typeof result>) => (r.evaluated && r.evaluated.ok ? r.evaluated.nextCalls : NaN);

const text = result('square', 'text');
const tree = result('square', 'tree');
const counter = result('counter', 'tree');
const once = result('once', 'tree');
const capture = result('capture', 'tree');
const hygienic = result('capture', 'hygienic');
const withEmail = objectWith(['email']);
const keys = probe(PROBES.find((p) => p.id === 'object-keys')!, BASE);
const catches = (m: (typeof MISTAKES)[number]['id']) => TECHNIQUES.filter((t) => runPipeline(t, m).kind === 'surfaces').length;
const silent = (m: (typeof MISTAKES)[number]['id']) => TECHNIQUES.filter((t) => runPipeline(t, m).kind === 'never').length;

export const FACTS = {
  limit: EXPANSION_LIMIT,
  textSource: text.source!,
  textValue: value(text),
  treeSource: tree.source!,
  treeValue: value(tree),
  counterSource: counter.source!,
  counterValue: value(counter),
  counterCalls: calls(counter),
  onceCalls: calls(once),
  onceValue: value(once),
  captureValue: value(capture),
  captureProblems: capture.problems!.captured.length,
  hygienicValue: value(hygienic),
  hygienicSource: hygienic.source!,
  recursiveError: result('recursive', 'tree').expanded.ok ? '' : (result('recursive', 'tree').expanded as { error: string }).error,
  keysLog: keys.log.map((e) => e.trap).join(', '),
  staleAfterEmail: [reflective(withEmail), generate(BASE).serialise(withEmail), handWritten([])(withEmail)].filter((out) => out !== JSON.stringify(withEmail)).length,
  misspelledCatches: catches('misspelled'),
  misspelledSilent: silent('misspelled'),
  wrongTypeCatches: catches('wrong-type'),
  wrongTypeSilent: silent('wrong-type'),
  laterCatches: catches('added-later'),
  laterSilent: silent('added-later'),
};
