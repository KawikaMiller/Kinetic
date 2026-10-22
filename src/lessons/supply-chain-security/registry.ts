/**
 * A fictional registry: fifteen invented packages, three invented services and the releases of each. Nothing
 * here is a real package, registry or company, and no package contains anything: the one "compromised release"
 * is a flag on a version number, and the lesson says so wherever it shows it.
 */

export interface Release {
  version: string;
  /** Day the release was published, relative to the day of the bad release (day 0). Long-standing releases are negative. */
  day: number;
  /** The abstract flag: this release is the compromised one. */
  compromised?: boolean;
  /** The day the registry pulls it, when it is pulled. */
  withdrawnDay?: number;
}

export interface Dependency {
  name: string;
  range: string;
}

/** The deep package that publishes the compromised release, and its version. */
export const COMPROMISED_PACKAGE = 'tiny-pad';
export const COMPROMISED_VERSION = '1.2.1';
/** The registry pulls the bad release on this day (illustrative). */
export const WITHDRAWN_DAY = 4;

const old = (version: string): Release => ({ version, day: -100 });

export const RELEASES: Record<string, Release[]> = {
  'web-kit': [old('2.1.0'), old('2.1.3'), old('2.2.0')],
  'http-lite': [old('1.4.0'), old('1.4.2'), old('1.5.0')],
  'url-bits': [old('1.1.0'), old('1.1.4')],
  'str-utils': [old('2.3.0'), old('2.3.4'), old('2.3.5-beta.1'), old('2.4.0')],
  'ui-icons': [old('2.0.0'), old('2.1.0')],
  'svg-core': [old('3.0.0'), old('3.0.2')],
  'tiny-pad': [old('1.0.0'), old('1.1.0'), old('1.2.0'), { version: COMPROMISED_VERSION, day: 0, compromised: true, withdrawnDay: WITHDRAWN_DAY }],
  'api-core': [old('1.3.0'), old('1.3.5')],
  'json-tool': [old('4.0.0'), old('4.2.0')],
  'log-tool': [old('3.2.1'), old('3.2.4'), old('3.3.0')],
  'color-bits': [old('1.0.0'), old('1.0.1')],
  'batch-core': [old('0.9.0'), old('0.9.2')],
  'queue-lib': [old('5.1.0'), old('5.1.1')],
  'retry-kit': [old('2.0.0'), old('2.0.3')],
  'csv-lite': [old('0.8.0'), old('0.8.3'), old('0.9.0')],
};

export const PACKAGE_NAMES: readonly string[] = Object.keys(RELEASES);

/** What each package asks for, by name and range (the same for every release of it). */
export const DEPENDENCIES: Record<string, Dependency[]> = {
  'web-kit': [{ name: 'http-lite', range: '^1.4.0' }, { name: 'tiny-pad', range: '^1.2.0' }, { name: 'ui-icons', range: '^2.0.0' }],
  'http-lite': [{ name: 'url-bits', range: '^1.1.0' }, { name: 'tiny-pad', range: '^1.0.0' }],
  'url-bits': [{ name: 'str-utils', range: '~2.3.0' }],
  'ui-icons': [{ name: 'svg-core', range: '^3.0.0' }],
  'svg-core': [],
  'str-utils': [{ name: 'tiny-pad', range: '^1.2.0' }],
  'tiny-pad': [],
  'api-core': [{ name: 'http-lite', range: '^1.4.0' }, { name: 'json-tool', range: '^4.0.0' }, { name: 'log-tool', range: '~3.2.1' }],
  'json-tool': [{ name: 'str-utils', range: '~2.3.0' }],
  'log-tool': [{ name: 'color-bits', range: '^1.0.0' }],
  'color-bits': [],
  'batch-core': [{ name: 'queue-lib', range: '^5.1.0' }, { name: 'log-tool', range: '~3.2.1' }, { name: 'csv-lite', range: '^0.8.0' }],
  'queue-lib': [{ name: 'retry-kit', range: '^2.0.0' }],
  'retry-kit': [],
  'csv-lite': [{ name: 'str-utils', range: '~2.3.0' }],
};

export const SERVICES: Record<string, Dependency[]> = {
  'svc-web': [{ name: 'web-kit', range: '^2.1.0' }],
  'svc-api': [{ name: 'api-core', range: '^1.3.0' }],
  'svc-batch': [{ name: 'batch-core', range: '^0.9.0' }],
};

export const SERVICE_NAMES: readonly string[] = Object.keys(SERVICES);

/** Every edge, dependent first: services, then packages. */
export function edges(): { from: string; to: string; range: string }[] {
  return [...Object.entries(SERVICES), ...Object.entries(DEPENDENCIES)].flatMap(([from, deps]) => deps.map((d) => ({ from, to: d.name, range: d.range })));
}

/** Names of everything a graph query can see, services included. */
export const ALL_NODES: readonly string[] = [...SERVICE_NAMES, ...PACKAGE_NAMES];
