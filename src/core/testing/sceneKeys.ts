import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every scene a Stage returns, as `[component, hasKey]`. When two scenes render the same component type React reuses
 * the instance on a switch, so the second scene would open on the first one's state unless each carries its own `key`.
 */
export function sceneElements(lessonId: string): { component: string; keyed: boolean }[] {
  const source = readFileSync(join(process.cwd(), 'src', 'lessons', lessonId, 'Stage.tsx'), 'utf8');
  const returns = [...source.matchAll(/return\s+<(\w+)([^>]*?)\/>/g)];
  return returns.map((m) => ({ component: m[1], keyed: /\bkey=/.test(m[2]) }));
}

/** Component types that more than one scene returns. */
export function sharedSceneComponents(lessonId: string): string[] {
  const seen = new Map<string, number>();
  for (const { component } of sceneElements(lessonId)) seen.set(component, (seen.get(component) ?? 0) + 1);
  return [...seen].filter(([, count]) => count > 1).map(([name]) => name);
}
