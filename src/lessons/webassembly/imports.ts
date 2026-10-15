export type Missing = 'env' | 'log';

/** What the module gets: nothing, an env without log, or a log that records what it is called with. */
export function importsFor(granted: boolean, missing: Missing, log: (n: number) => void): WebAssembly.Imports {
  if (granted) return { env: { log } };
  return missing === 'env' ? {} : { env: {} };
}

