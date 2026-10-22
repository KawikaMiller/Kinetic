/** Every number the lesson text quotes that does not need the crypto API, computed once from the model at each scene's opening state. */
import { CLASS_ORDER, DEFENCE_ORDER, defenceSet, verdictOf, type DefenceId } from './matrix';
import { nearest } from './names';
import { INSTALL_DAY, initialIntegrity, initialMatrix, initialSpread } from './opening';
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION, PACKAGE_NAMES, SERVICE_NAMES, WITHDRAWN_DAY } from './registry';
import { releaseStatus } from './resolve';
import { holders, sbomOf } from './sbom';
import { spreadNumbers } from './captions';
import { TARBALL_BYTES } from './integrity';
import { installAll } from './resolve';

const spread = initialSpread();
const counts = (on: readonly DefenceId[]) => {
  const verdicts = CLASS_ORDER.map((c) => verdictOf(c, defenceSet(...on)));
  return { blocked: verdicts.filter((v) => v === 'blocked').length, limited: verdicts.filter((v) => v === 'limited').length, open: verdicts.filter((v) => v === 'open').length };
};
const matrix = initialMatrix();
const integrity = initialIntegrity();
const near = nearest(matrix.name, 1)[0];
const sboms = sbomOf(installAll('ranges', 'before', { day: INSTALL_DAY, cooldown: 0 }));

export const FACTS = {
  bad: `${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION}`,
  packages: PACKAGE_NAMES.length,
  services: SERVICE_NAMES.length,
  installDay: INSTALL_DAY,
  rangesServices: spreadNumbers('ranges', spread.lockWhen).affected.services.length,
  rangesPackages: spreadNumbers('ranges', spread.lockWhen).affected.packages.length,
  lockBeforeServices: spreadNumbers('lockfile', 'before').affected.services.length,
  lockAfterServices: spreadNumbers('lockfile', 'after').affected.services.length,
  lockAfterPackages: spreadNumbers('lockfile', 'after').affected.packages.length,
  exactServices: spreadNumbers('exact', 'before').affected.services.length,
  tarballBytes: TARBALL_BYTES,
  withdrawnDay: WITHDRAWN_DAY,
  openingStatus: releaseStatus({ day: integrity.installDay, cooldown: integrity.cooldown }),
  heldBackStatus: releaseStatus({ day: integrity.installDay, cooldown: 3 }),
  withdrawnStatus: releaseStatus({ day: WITHDRAWN_DAY, cooldown: 0 }),
  matrixDefences: matrix.defences.length,
  matrixOpening: counts(matrix.defences),
  matrixScopes: counts([...matrix.defences, 'scopes']),
  matrixAll: counts(DEFENCE_ORDER),
  nameTyped: matrix.name,
  nameNear: near.name,
  nameDistance: near.distance,
  sbomHolders: holders(sboms, COMPROMISED_PACKAGE).length,
};
