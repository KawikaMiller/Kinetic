/** The software bill of materials: every component and version in each service's install, and the "who has it?" query. */
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION, SERVICE_NAMES } from './registry';
import type { Resolution } from './resolve';

export interface Component {
  name: string;
  version: string;
}

export interface Sbom {
  service: string;
  components: Component[];
}

/** One SBOM per service, components sorted by name. */
export function sbomOf(installs: ReadonlyMap<string, Resolution>): Sbom[] {
  return SERVICE_NAMES.map((service) => ({
    service,
    components: [...(installs.get(service) ?? new Map<string, string>())].map(([name, version]) => ({ name, version })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export interface Holder {
  service: string;
  version: string;
  compromised: boolean;
}

/** Which services contain the component, and at which version. */
export function holders(sboms: readonly Sbom[], name: string): Holder[] {
  return sboms.flatMap((s) =>
    s.components.filter((c) => c.name === name).map((c) => ({ service: s.service, version: c.version, compromised: c.name === COMPROMISED_PACKAGE && c.version === COMPROMISED_VERSION })),
  );
}
