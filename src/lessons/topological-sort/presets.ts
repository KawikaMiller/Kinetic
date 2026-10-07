import type { Dag } from './model';

export type PresetId = 'courses' | 'packages' | 'build' | 'migrations';

export interface Preset {
  id: PresetId;
  label: string;
  /** What an arrow means in this world. */
  arrow: string;
  graph: Dag;
  /** An edge that closes a cycle, for the "Close a cycle" button. */
  trap: { from: string; to: string };
}

const dag = (nodes: string[], pairs: [string, string][]): Dag => ({ nodes, edges: pairs.map(([from, to]) => ({ from, to })) });

export const PRESETS: readonly Preset[] = [
  {
    id: 'courses',
    label: 'Courses',
    arrow: 'is a prerequisite of',
    graph: dag(
      ['Prog 1', 'Math 1', 'Prog 2', 'Discrete', 'Data str', 'OS', 'Algos', 'Databases', 'Networks', 'Compilers'],
      [
        ['Prog 1', 'Prog 2'], ['Math 1', 'Discrete'], ['Prog 2', 'Data str'], ['Discrete', 'Data str'], ['Prog 2', 'OS'],
        ['Data str', 'Algos'], ['Data str', 'Databases'], ['OS', 'Databases'], ['OS', 'Networks'], ['Algos', 'Compilers'],
      ],
    ),
    trap: { from: 'Algos', to: 'Prog 2' },
  },
  {
    id: 'packages',
    label: 'npm packages',
    arrow: 'must be installed before',
    graph: dag(
      ['scheduler', 'react', 'lodash', 'qs', 'react-dom', 'express', 'my-app'],
      [
        ['scheduler', 'react-dom'], ['react', 'react-dom'], ['qs', 'express'], ['lodash', 'express'],
        ['react-dom', 'my-app'], ['express', 'my-app'],
      ],
    ),
    trap: { from: 'react-dom', to: 'react' },
  },
  {
    id: 'build',
    label: 'Build pipeline',
    arrow: 'has to finish before',
    graph: dag(
      ['fetch', 'install', 'codegen', 'compile', 'test', 'lint', 'bundle', 'deploy'],
      [
        ['fetch', 'install'], ['install', 'codegen'], ['codegen', 'compile'], ['compile', 'test'],
        ['compile', 'lint'], ['compile', 'bundle'], ['test', 'deploy'], ['lint', 'deploy'], ['bundle', 'deploy'],
      ],
    ),
    trap: { from: 'test', to: 'codegen' },
  },
  {
    id: 'migrations',
    label: 'DB migrations',
    arrow: 'must run before',
    graph: dag(
      ['users', 'orgs', 'members', 'projects', 'tasks', 'task_idx'],
      [
        ['users', 'members'], ['orgs', 'members'], ['orgs', 'projects'], ['projects', 'tasks'],
        ['members', 'tasks'], ['tasks', 'task_idx'],
      ],
    ),
    trap: { from: 'tasks', to: 'projects' },
  },
];
