/**
 * Licence facts and the rule table behind the resolver. Simplified for learning, not legal advice:
 * each rule is a short summary of what the licence text says, with the section it comes from.
 */

export const LICENCES = [
  'MIT', 'BSD-3-Clause', 'Apache-2.0', 'MPL-2.0', 'LGPL-2.1-only', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only', 'none',
] as const;
export type LicenceId = (typeof LICENCES)[number];

export type Family = 'permissive' | 'file copyleft' | 'library copyleft' | 'strong copyleft' | 'network copyleft' | 'no licence';

export interface LicenceFacts {
  /** The SPDX identifier, or null when there is no licence to identify. */
  spdx: string | null;
  name: string;
  family: Family;
  blurb: string;
}

export const LICENCE_FACTS: Record<LicenceId, LicenceFacts> = {
  MIT: {
    spdx: 'MIT', name: 'MIT licence', family: 'permissive',
    blurb: 'Permissive. Do almost anything with it, as long as the copyright and permission notice travel with copies.',
  },
  'BSD-3-Clause': {
    spdx: 'BSD-3-Clause', name: 'BSD 3-clause licence', family: 'permissive',
    blurb: "Permissive like MIT, plus a clause: you may not use the authors' names to endorse your product without permission.",
  },
  'Apache-2.0': {
    spdx: 'Apache-2.0', name: 'Apache licence 2.0', family: 'permissive',
    blurb: 'Permissive, plus an express patent licence from contributors (which ends for you if you sue over the Work), a NOTICE-file convention, and a duty to mark files you changed.',
  },
  'MPL-2.0': {
    spdx: 'MPL-2.0', name: 'Mozilla Public Licence 2.0', family: 'file copyleft',
    blurb: 'Weak, file-level copyleft: when you distribute, changes to MPL-covered files stay under the MPL. Your own separate files can carry other terms.',
  },
  'LGPL-2.1-only': {
    spdx: 'LGPL-2.1-only', name: 'GNU Lesser GPL 2.1', family: 'library copyleft',
    blurb: 'Weak copyleft for libraries: other software can use the library, but users must be able to swap in a modified version. Dynamic linking is the usual route.',
  },
  'GPL-2.0-only': {
    spdx: 'GPL-2.0-only', name: 'GNU GPL 2.0', family: 'strong copyleft',
    blurb: "Strong copyleft: when you distribute a work based on GPL code, the whole work is offered under the GPL with its source. 'Only' rules out later GPL versions.",
  },
  'GPL-3.0-only': {
    spdx: 'GPL-3.0-only', name: 'GNU GPL 3.0', family: 'strong copyleft',
    blurb: 'Strong copyleft like GPL-2.0, with explicit patent terms and extra rules for consumer devices. Apache-2.0 code can go into a GPL-3.0 work.',
  },
  'AGPL-3.0-only': {
    spdx: 'AGPL-3.0-only', name: 'GNU Affero GPL 3.0', family: 'network copyleft',
    blurb: 'GPL-3.0 terms plus §13: if you modify the program and users interact with it over a network, you must offer them the source of your version.',
  },
  none: {
    spdx: null, name: 'No licence', family: 'no licence',
    blurb: "No licence text means copyright's default applies: all rights reserved. Being visible online is not permission.",
  },
};

/** What a licence badge reads: the SPDX identifier, or "no licence". */
export const badge = (id: LicenceId): string => LICENCE_FACTS[id].spdx ?? 'no licence';

export const MODELS = ['internal', 'distributed', 'saas', 'library'] as const;
export type Model = (typeof MODELS)[number];

export const MODEL_LABEL: Record<Model, string> = {
  internal: 'Internal tool only',
  distributed: 'Distributed binary / app',
  saas: 'SaaS (network service)',
  library: 'Library others link against',
};

export const MODEL_NOTE: Record<Model, string> = {
  internal: 'Only your own organisation runs it. No copy goes to anyone else.',
  distributed: 'You hand copies (an installer, an app, a container image) to customers or the public.',
  saas: 'Users reach a service you run; they receive no copy of the server code. Code you send to their browsers or devices is distributed: treat that part as the distributed column.',
  library: 'You publish a library for others to link against. That is distribution, and your own licence choice is inherited by everyone who builds on it.',
};

/** Handing copies to others is what triggers most licence conditions. */
export const distributes = (model: Model): boolean => model === 'distributed' || model === 'library';

export const PRODUCT_LICENCES = ['proprietary', 'MIT', 'Apache-2.0', 'MPL-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only'] as const;
export type ProductLicence = (typeof PRODUCT_LICENCES)[number];

export const productLabel = (p: ProductLicence): string => (p === 'proprietary' ? 'Proprietary' : p);

export type ObligationId =
  | 'notice' | 'no-endorse' | 'apache-notice' | 'state-changes' | 'patent'
  | 'mpl-files' | 'lgpl-source' | 'relink' | 'gpl-source' | 'gpl-whole' | 'agpl-network' | 'no-permission';

/** The facts a rule looks at besides the licence. */
export interface Setup {
  model: Model;
  /** The team changed the dependency's own files. */
  modified: boolean;
  /** A separate program the product talks to (a database server), not code linked into it. */
  separate: boolean;
}

export interface Rule {
  id: ObligationId;
  label: string;
  /** `grant` is a benefit the licence gives you, not a task. */
  kind: 'duty' | 'grant';
  /** True for conditions that pass copyleft on (the violet ones). */
  copyleft: boolean;
  source: string;
  due: (s: Setup) => boolean;
  detail: (s: Setup) => string;
  /** Why it isn't triggered, when the generic distribution reason isn't the whole story. */
  idle?: (s: Setup) => string;
}

const whenDistributed = (s: Setup) => distributes(s.model);
const whenBundledAndDistributed = (s: Setup) => distributes(s.model) && !s.separate;

/** The generic reason a distribution-triggered rule is quiet. */
export function idleReason(s: Setup): string {
  if (s.model === 'internal') return 'Not triggered: no copy leaves your organisation, and using it is not distributing it.';
  if (s.model === 'saas') return 'Not triggered: users reach a running service; nobody receives a copy.';
  return 'Not triggered in this setup.';
}

const notice = (label: string, detail: string, source: string): Rule => ({
  id: 'notice', label, kind: 'duty', copyleft: false, source, due: whenDistributed, detail: () => detail,
});

const SEPARATE_NOTE = 'Marked as a separate program, so it is treated as not combined with yours (a simplification: how programs are combined is fact-specific).';

const GPL_SAAS_NOTE = 'Not triggered: the GPL has no network clause and running a service conveys no copy. (The AGPL is different.)';

const gplRules = (v: '2.0' | '3.0'): Rule[] => {
  const only = v === '2.0' ? 'GPL-2.0' : 'GPL-3.0';
  return [
    notice(
      'Keep notices; give the licence text',
      `Keep the copyright and licence notices and give recipients a copy of the ${only} licence.`,
      v === '2.0' ? 'GPL-2.0 §1-§2' : 'GPL-3.0 §4-§5',
    ),
    {
      id: 'gpl-source', label: 'Offer the GPL code’s source', kind: 'duty', copyleft: true,
      source: v === '2.0' ? 'GPL-2.0 §3' : 'GPL-3.0 §6',
      due: whenDistributed,
      detail: () => 'Make the complete corresponding source of the GPL-covered program, including your changes to it, available to recipients of a copy.',
      idle: (s) => (s.model === 'saas' ? GPL_SAAS_NOTE : idleReason(s)),
    },
    {
      id: 'gpl-whole', label: 'Whole combined work under the GPL', kind: 'duty', copyleft: true,
      source: v === '2.0' ? 'GPL-2.0 §2(b)' : 'GPL-3.0 §5(c)',
      due: whenBundledAndDistributed,
      detail: () => `The combined work you distribute is licensed as a whole under ${only}, with source for the whole. Which ways of combining (dynamic linking, plugins) form one work is legally contested.`,
      idle: (s) => (s.separate && distributes(s.model) ? SEPARATE_NOTE : s.model === 'saas' ? GPL_SAAS_NOTE : idleReason(s)),
    },
  ];
};

/** The rule table: for each licence, what it asks, when. */
export const RULES: Record<LicenceId, readonly Rule[]> = {
  MIT: [
    notice('Keep the copyright and permission notice', 'Include the copyright notice and the MIT permission notice in all copies or substantial portions you distribute. A third-party notices file is the usual way.', 'MIT licence text'),
  ],
  'BSD-3-Clause': [
    notice('Keep the copyright notice, conditions and disclaimer', 'Source redistributions keep the notice; binary redistributions reproduce it in documentation or other materials.', 'BSD-3-Clause text'),
    {
      id: 'no-endorse', label: "Don't use the authors' names to promote", kind: 'duty', copyleft: false, source: 'BSD-3-Clause, clause 3',
      due: whenDistributed,
      detail: () => "Don't use the copyright holder's or contributors' names to endorse or promote your product without written permission.",
    },
  ],
  'Apache-2.0': [
    notice('Give the licence; keep notices', 'Give recipients a copy of the licence and keep the copyright, patent, trademark and attribution notices.', 'Apache-2.0 §4(a), §4(c)'),
    {
      id: 'apache-notice', label: 'Carry its NOTICE file forward', kind: 'duty', copyleft: false, source: 'Apache-2.0 §4(d)',
      due: whenDistributed,
      detail: () => "If the project ships a NOTICE file, carry its attribution notices into your distribution: in a NOTICE file, the documentation or the app's UI.",
    },
    {
      id: 'state-changes', label: 'State your changes', kind: 'duty', copyleft: false, source: 'Apache-2.0 §4(b)',
      due: (s) => distributes(s.model) && s.modified,
      detail: () => 'Files you modified carry prominent notices that you changed them.',
      idle: (s) => (distributes(s.model) ? 'Not triggered: you have not modified its files.' : idleReason(s)),
    },
    {
      id: 'patent', label: 'Patent licence, with a retaliation clause', kind: 'grant', copyleft: false, source: 'Apache-2.0 §3',
      due: () => false,
      detail: () => 'Each contributor grants you a patent licence for their contributions. It ends for you if you sue claiming the Work infringes a patent.',
    },
  ],
  'MPL-2.0': [
    notice('Keep notices', 'Keep the licence notices in the files and point recipients to the licence.', 'MPL-2.0 §3.4'),
    {
      id: 'mpl-files', label: 'MPL files stay MPL, source available', kind: 'duty', copyleft: true, source: 'MPL-2.0 §3.1-§3.2',
      due: whenDistributed,
      detail: (s) => (s.modified
        ? 'Files you changed stay under MPL-2.0 and their source must be available to recipients. Your own separate files can use other terms (file-level copyleft).'
        : 'Tell recipients how to get the source of the MPL-covered files. Your own separate files can use other terms (file-level copyleft).'),
    },
  ],
  'LGPL-2.1-only': [
    notice('Keep notices; give the licence text', 'Keep the copyright and licence notices and give recipients a copy of the LGPL.', 'LGPL-2.1 §1-§4'),
    {
      id: 'lgpl-source', label: 'The library stays LGPL, source available', kind: 'duty', copyleft: true, source: 'LGPL-2.1 §2-§4',
      due: whenDistributed,
      detail: () => "The library itself, including any changes you made to it, stays under the LGPL and its source is offered to recipients.",
    },
    {
      id: 'relink', label: 'Let users replace the library', kind: 'duty', copyleft: true, source: 'LGPL-2.1 §6',
      due: whenBundledAndDistributed,
      detail: () => 'Users must be able to modify the library and use their version with your program. Dynamic linking to a shared copy is the usual way; static linking also means supplying what is needed to relink (for example object files). Details are version-specific.',
      idle: (s) => (s.separate && distributes(s.model) ? SEPARATE_NOTE : idleReason(s)),
    },
  ],
  'GPL-2.0-only': gplRules('2.0'),
  'GPL-3.0-only': gplRules('3.0'),
  'AGPL-3.0-only': [
    ...gplRules('3.0').map((r) => ({
      ...r,
      label: r.label.replace('GPL', 'AGPL'),
      source: r.source.replace('GPL-3.0', 'AGPL-3.0'),
      detail: (s: Setup) => r.detail(s).replace('GPL-3.0', 'AGPL-3.0').replace('under the GPL', 'under the AGPL'),
      idle: (s: Setup) => (s.model === 'saas' ? 'Not triggered by distribution: nothing is distributed. The network clause below covers a service.' : (r.idle ?? idleReason)(s)),
    })),
    {
      id: 'agpl-network', label: 'Offer source to network users', kind: 'duty', copyleft: true, source: 'AGPL-3.0 §13',
      due: (s) => s.model === 'saas' && (s.modified || !s.separate),
      detail: (s) => (s.separate
        ? 'You modified this program and users interact with it over a network: offer them the corresponding source of your modified version.'
        : 'Built into your service, it arguably makes your service a modified version of the AGPL program: offer your service’s corresponding source to its network users (contested for each way of combining).'),
      idle: (s) => (s.model === 'saas'
        ? 'Not triggered: §13 applies to a modified version, and this is an unmodified, separate program. Whether your own staff count as users, or your code is combined with it, is a question for your lawyers.'
        : 'Not triggered: assumes only your own organisation uses it. If outsiders can reach it, treat it as the SaaS column.'),
    },
  ],
  none: [
    {
      id: 'no-permission', label: 'No permission granted', kind: 'duty', copyleft: false, source: "Copyright law's default: all rights reserved",
      due: () => true,
      detail: () => "Without a licence you generally have no right to copy, modify or distribute it, even for an internal tool (copying is itself a reserved right). Ask the author for a licence, or use something else.",
    },
  ],
};

export const SOURCE_NOTES = {
  fsf: "FSF's licence list (gnu.org/licenses/license-list)",
  osi: 'OSI-approved licence texts (opensource.org/licenses)',
};

/** Labels for the tree-wide tally, where one duty id can come from several licences. */
export const ROLLUP_LABEL: Partial<Record<ObligationId, string>> = {
  notice: 'Keep notices, give licence text',
  'gpl-source': 'Offer source of the GPL-family code',
  'gpl-whole': 'Whole work under the GPL / AGPL',
};
