import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'You ship your dependencies too: trust and integrity are separate from versions, a lockfile freezes a choice without vouching for it, and a signature says who built something, not that it is safe.',
    what: `A fictional tree of ${F.packages} packages feeds ${F.services} services, and one deep package publishes a compromised release (a flag in the model: nothing here contains anything). Under version ranges, ${F.rangesServices} of ${F.services} services pick it up on the next install; a lockfile or exact pins hold the old version, unless the lockfile was written after the release. Integrity hashes catch changed bytes, a cooldown holds back a young release, and provenance and a bill of materials say who built what and who has it.`,
    analogy: 'It is a restaurant sourcing ingredients through suppliers of suppliers: a shopping list freezes what you chose, a seal on the box shows nobody opened it, and a label says who packed it, but none of them says the food is fresh.',
    useCases: [
      'Deciding between ranges, pins and a lockfile for an application that is deployed often',
      'Turning on integrity checks, a release cooldown and install-script limits in a package manager',
      'Answering "which of our services contain this package?" within minutes of an advisory',
      'Reading a build-provenance claim and knowing what it does and does not prove',
    ],
    why: 'Much of the code you run was written by people you never chose, and one change deep in the tree reaches every service that depends on it. Knowing which defence covers which class of problem, and which ones only reduce it, lets you spend effort where the gaps are.',
    watch: 'In the graph a package or service that runs the compromised release is red (--bad), the compromised package itself solid red, a dependent that held back green (--ok) and a package that does not depend on it grey (--dim). In the matrix a defence that is switched on has a violet heading (--violet), the layer that blocks a class is green, a layer that limits it blue (--info) and a class that is open red. A name-similarity warning is orange (--orange). Integrity and attestation checks pass in green and fail in red; the day strip is green where the release is held back, red where it is installed and grey once it is pulled.',
  },
  tryThis: [
    `Propagation, on the defaults (ranges, no lockfile, install on day ${F.installDay}): ${F.rangesServices} of ${F.services} services and ${F.rangesPackages} packages run ${F.bad}. Pick Ranges with a lockfile: ${F.lockBeforeServices} services, since the lock was written before the release. Then switch Lockfile written to After it: ${F.lockAfterServices} of ${F.services} again.`,
    `Integrity, on the defaults (check on, install day ${F.installDay}, cooldown 0): the release is installed. Click any byte of the tarball: the install is refused. Turn the integrity check off: it installs the changed bytes. Click the byte again, then set the cooldown to 3: the release is held back.`,
    `Attack classes, on the defaults (pin and lock and integrity hashes on): ${F.matrixOpening.blocked} classes blocked, ${F.matrixOpening.limited} limited, ${F.matrixOpening.open} open. Turn on single-source scopes: ${F.matrixScopes.blocked} blocked. The name ${F.nameTyped} is ${F.nameDistance} edit from ${F.nameNear}: a warning. With all seven on, ${F.matrixAll.blocked} are blocked and ${F.matrixAll.limited} only limited.`,
    `Provenance, on the defaults (the genuine build): every check passes. Pick A repackaged artifact: the artifact hash no longer matches the attestation. Ask the SBOM which services contain tiny-pad: ${F.sbomHolders} of ${F.services}.`,
  ],
  keyIdeas: [
    `A lockfile freezes a choice, not a verdict: in this model ranges put ${F.bad} in ${F.rangesServices} of ${F.services} services, a lockfile written before the release in ${F.lockBeforeServices}, and one written after it in ${F.lockAfterServices}.`,
    `Integrity compares bytes with a recorded hash: changing one of the ${F.tarballBytes} bytes of the fake tarball gives a different SHA-256, so the check refuses it, and with the check off the same version number installs different bytes.`,
    `Defences are layers with gaps: with all seven on in this model ${F.matrixAll.blocked} of ${F.classCount} classes are blocked and ${F.matrixAll.limited} only limited, and a compromised build, a compromised maintainer account or a leaked CI credential is never blocked outright, because a valid signature does not make a release benign.`,
    `Signed does not mean safe: an attestation ties an artifact to a builder and a commit, and an SBOM answers "which of my ${F.services} services contain this package?" in one lookup.`,
  ],
  quiz: [
    {
      q: 'A team commits a lockfile. What does it guarantee about the compromised release?',
      options: [
        'It checks every version against a list of known-bad releases before each install runs',
        'It makes the install safe, because a locked version has been reviewed by the registry',
        'It keeps whatever versions were chosen when it was written, so a bad version chosen then stays',
        'It blocks any release published after the lockfile was written, bad or good, forever',
      ],
      answer: 2,
      why: `In this model a lockfile written before the release holds ${F.lockBeforeServices} of ${F.services} services clear of ${F.bad}; written after it, the lock holds ${F.lockAfterServices} of ${F.services} on the bad version. It freezes a choice, it does not vouch for it.`,
    },
    {
      q: 'A release comes with a valid build attestation. What does that show?',
      options: [
        'That the code was reviewed for malicious behaviour by the registry before it was published',
        'That the release is safe to install, because a signature can only be made on safe code',
        'That the maintainer account has not been compromised, since the attestation is signed',
        'Who built the artifact, from which commit; it does not show that the code is benign',
      ],
      answer: 3,
      why: 'The checks tie an artifact hash to a builder and a commit. A compromised build or a compromised maintainer can still produce a release that verifies, which is why provenance limits those classes in this matrix and does not block them.',
    },
    {
      q: `The compromised release sits deep in the dependency tree, in tiny-pad. Which services are affected?`,
      options: [
        'Only the services that list it directly in their own dependencies',
        'Every service that reaches it through any chain of dependencies, found by following the graph back',
        'Only the services whose lockfile was written by hand rather than generated by the tool',
        'None of them, since a package deep in the tree is not installed unless it is asked for',
      ],
      answer: 1,
      why: `Reverse reachability from ${F.bad} finds ${F.rangesPackages} packages that are it or depend on it, and the ${F.services} services run it in this model, though no service lists it directly. Indirect dependencies matter as much as direct ones.`,
    },
    {
      q: 'The integrity check is off and one byte of the tarball has changed. What happens at install?',
      options: [
        'The changed bytes install under the same version number, and nothing looks different',
        'The installer notices the changed byte by itself and refuses it, check or no check at all',
        'The version number changes to show that the contents differ from the recorded ones',
        'The install is delayed by the cooldown until the registry can confirm the new bytes',
      ],
      answer: 0,
      why: 'The version number is a label, not a hash. With the check off the lockfile still records the old hash, but nothing compares it, so different bytes go in under the same name and number.',
    },
  ],
};

export default lesson;
