import type { GraphCommit } from '../../components/CommitGraph';
import { LEAKED_KEY, type Commit } from './model';

/** Commits as CommitGraph rows: the ones holding the key are red while it works, grey once it's dead. */
export function graphCommits(commits: Commit[], keyWorks: boolean): GraphCommit[] {
  return commits.map((c) => ({
    id: c.id,
    lane: 0,
    parents: c.parents,
    short: c.id,
    message: c.message,
    tone: Object.values(c.files).some((f) => f.includes(LEAKED_KEY)) ? (keyWorks ? 'bad' : 'dim') : 'info',
  }));
}
