import { genOf, type Config } from './config';
import { findAndShrink } from './runner';
import { bugOf } from './sorts';

/** Run the whole find-and-shrink pipeline twice from the seed and compare: the replay claim, computed. */
export function replayIdentical(config: Config): boolean {
  const run = () => findAndShrink(bugOf(config.fn).fn, config.props, genOf(config));
  return JSON.stringify(run()) === JSON.stringify(run());
}
