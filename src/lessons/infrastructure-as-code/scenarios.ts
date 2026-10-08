/** The preset worlds: a config text plus the state and cloud it starts against. */
import { consoleEdit, converge, emptyWorld, loseState, type World } from './model';
import { parseConfig } from './parse';

export const BASELINE = `# A fictional provider: a network, two VMs, a bucket and a DNS record.
resource "network" "main" {
  name = "main-net"
  cidr = "10.0.0.0/16"
}

resource "vm" "web1" {
  name    = "web-1"
  network = network.main
  image   = "debian-12"
  size    = "small"
  tags    = { env = "prod" }
}

resource "vm" "web2" {
  name    = "web-2"
  network = network.main
  image   = "debian-12"
  size    = "small"
  tags    = { env = "prod" }
}

resource "bucket" "assets" {
  name       = "assets-demo"
  versioning = false
}

resource "dns_record" "www" {
  name   = "www"
  target = vm.web1
  ttl    = 300
}
`;

export type ScenarioId = 'fresh' | 'rename' | 'tag' | 'delete' | 'cidr' | 'drift' | 'lost';

export interface Scenario {
  id: ScenarioId;
  label: string;
  /** What this preset did to the world, for the caption. */
  blurb: string;
  text: string;
  world: () => World;
}

const parsed = parseConfig(BASELINE);
if (!parsed.ok) throw new Error(`baseline config does not parse: line ${parsed.line}: ${parsed.message}`);
/** The baseline, applied: state and cloud agree with the config. */
export const baselineWorld = () => converge(parsed.config);

const BUCKET_BLOCK = `resource "bucket" "assets" {
  name       = "assets-demo"
  versioning = false
}

`;

const edit = (from: string, to: string) => {
  if (!BASELINE.includes(from)) throw new Error(`preset edit not found: ${from}`);
  return BASELINE.replace(from, to);
};

export const SCENARIOS: Scenario[] = [
  { id: 'fresh', label: 'Fresh start', blurb: 'Nothing exists yet: the state and the cloud are empty.', text: BASELINE, world: emptyWorld },
  { id: 'rename', label: 'Rename a VM', blurb: 'The config renames web2 to api-1; everything already exists.', text: edit('name    = "web-2"', 'name    = "api-1"'), world: baselineWorld },
  { id: 'tag', label: 'Change a tag', blurb: 'The config changes web1\'s env tag to staging; everything already exists.', text: edit('tags    = { env = "prod" }', 'tags    = { env = "staging" }'), world: baselineWorld },
  { id: 'delete', label: 'Delete a block', blurb: 'The bucket block is gone from the config; the bucket still exists.', text: edit(BUCKET_BLOCK, ''), world: baselineWorld },
  { id: 'cidr', label: 'Change the CIDR', blurb: 'The config gives the network a new address range; everything already exists.', text: edit('10.0.0.0/16', '10.1.0.0/16'), world: baselineWorld },
  { id: 'drift', label: 'Console drift', blurb: 'Someone resized web1 to large in the cloud console; the config is unchanged.', text: BASELINE, world: () => consoleEdit(baselineWorld(), 'vm.web1', 'size', 'large') },
  { id: 'lost', label: 'Lost state file', blurb: 'The state file is gone; the five resources still exist in the cloud.', text: BASELINE, world: () => loseState(baselineWorld()) },
];

export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS.find((s) => s.id === id)!;
