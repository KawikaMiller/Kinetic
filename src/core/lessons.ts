import { TOPICS } from './curriculum';
import type { LessonModule, Topic } from './types';

// Every folder under src/lessons with an index.tsx is a built lesson.
// Loaded lazily so each lesson is its own chunk.
const modules = import.meta.glob<{ default: LessonModule }>('../lessons/*/index.tsx');

const loaders = new Map<string, () => Promise<{ default: LessonModule }>>();
for (const [path, load] of Object.entries(modules)) {
  const id = path.split('/')[2];
  loaders.set(id, load);
}

export const isBuilt = (id: string) => loaders.has(id);

export const loadLesson = async (id: string) => {
  const load = loaders.get(id);
  return load ? (await load()).default : null;
};

/** Built lessons in curriculum order: what "next / previous" walks through. */
export const BUILT_TOPICS: Topic[] = TOPICS.filter((t) => isBuilt(t.id));
