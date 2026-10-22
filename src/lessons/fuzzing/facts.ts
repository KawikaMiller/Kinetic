/** Every number the lesson text quotes, computed once from the model at each scene's opening state. */
import { bucketCrashes, describeOutcome, runFuzz } from './fuzzer';
import { parseHexBytes } from './hexInput';
import { crashesAt, minimise } from './minimise';
import { edgeName, largestCrash, totalEdges } from './model';
import { SEEDS_THAT_CRASH, initialCorpus, initialCrash, initialOracle, initialRace } from './opening';
import { DEFAULT_TARGET, runTarget } from './target';

const race = initialRace();
const raceTarget = { magic: race.magic, boundsCheck: true };
const guided = runFuzz({ kind: 'guided', seed: race.seed, executions: race.executions, target: raceTarget });
const blind = runFuzz({ kind: 'blind', seed: race.seed, executions: race.executions, target: raceTarget });
const singleTarget = { magic: 'single' as const, boundsCheck: true };
const guidedSingle = runFuzz({ kind: 'guided', seed: race.seed, executions: race.executions, target: singleTarget });

const corpusOpening = initialCorpus();
const corpusRun = runFuzz({ kind: 'guided', seed: corpusOpening.seed, executions: corpusOpening.executions, target: DEFAULT_TARGET });
const lastEntry = corpusRun.corpus[corpusRun.corpus.length - 1];

const crashOpening = initialCrash();
const crashRun = runFuzz({ kind: 'guided', seed: crashOpening.seed, executions: crashOpening.executions, target: DEFAULT_TARGET });
const buckets = bucketCrashes(crashRun.crashes);
const picked = largestCrash(crashRun.crashes, buckets[0].site)!;
const minimised = minimise(picked.bytes, (b) => crashesAt(b, buckets[0].site, DEFAULT_TARGET));

const oracleOpening = initialOracle();
const probe = parseHexBytes(oracleOpening.hex);
if (!probe.ok) throw new Error('the default probe input must parse');
const oracleOn = runFuzz({ kind: 'guided', seed: oracleOpening.seed, executions: oracleOpening.executions, target: { magic: 'bytewise', boundsCheck: true } });
const oracleOff = runFuzz({ kind: 'guided', seed: oracleOpening.seed, executions: oracleOpening.executions, target: { magic: 'bytewise', boundsCheck: false } });
const probeOn = runTarget(probe.value, { magic: 'bytewise', boundsCheck: true });
const probeOff = runTarget(probe.value, { magic: 'bytewise', boundsCheck: false });

export const n = (v: number) => v.toLocaleString('en-US');

export const FACTS = {
  seedsThatCrash: SEEDS_THAT_CRASH,
  seed: race.seed,
  executions: race.executions,
  total: totalEdges('bytewise'),
  totalSingle: totalEdges('single'),
  guidedEdges: guided.edges.size,
  guidedFirstCrash: guided.firstCrashAt!,
  guidedMagicAt: guided.magicAt!,
  blindEdges: blind.edges.size,
  blindCrashes: blind.crashes.length,
  guidedSingleEdges: guidedSingle.edges.size,
  guidedSingleMagic: guidedSingle.magicAt,
  corpusSize: corpusRun.corpus.length,
  lastEntryId: lastEntry.id,
  lastEntryParent: lastEntry.parent!,
  lastEntryEdges: lastEntry.newEdges.map(edgeName),
  crashes: crashRun.crashes.length,
  bucketCount: buckets.length,
  bucketSites: buckets.map((b) => b.site),
  largestLength: picked.bytes.length,
  minimisedLength: minimised.result.length,
  minimiseTries: minimised.steps.length,
  oracleOnCrashes: oracleOn.crashes.length,
  oracleOnOverReads: oracleOn.overReadRuns,
  oracleOffCrashes: oracleOff.crashes.length,
  oracleOffOverReads: oracleOff.overReadRuns,
  probeOn: describeOutcome(probeOn.outcome),
  probeOff: describeOutcome(probeOff.outcome),
  probeOffOverReads: probeOff.overReads,
};
