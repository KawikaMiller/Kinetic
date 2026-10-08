import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A licence is the permission slip that comes with code you did not write: what it asks of you mostly depends on how you ship, not on whether you use it. (An educational summary, not legal advice.)',
    what: "Open-source licences fall into rough families. Permissive ones (MIT, BSD-3-Clause, Apache-2.0) mostly ask you to keep notices; Apache-2.0 adds an express patent grant with a retaliation clause, a NOTICE-file convention and a duty to mark changed files. Copyleft ones attach conditions when you distribute: MPL-2.0 at the level of files, LGPL for libraries, GPL for the combined work you hand out, and AGPL also when users reach a modified version over a network. Code with no licence is all rights reserved by default. Whether a given way of combining code counts as one work is legally contested, and compatibility is one-way: Apache-2.0 code can join a GPL-3.0 work but not a GPL-2.0-only one. This lesson is a simplified model; lawyers decide.",
    analogy: 'Borrowing a tool from a neighbour: some say "just put it back", some say "put it back and tell everyone it is theirs", and some lend nothing at all because nobody said you could.',
    useCases: [
      'Choosing a library when your product will be shipped to customers, not just run on your servers',
      'Answering a customer security or procurement questionnaire about the open-source you bundle',
      'Deciding what licence your own project should carry, given what it depends on',
      'Setting up an allow-list and a licence scanner next to your dependency checks',
    ],
    why: 'Dependencies arrive by the hundred, and each one comes with terms. Knowing which terms bite when you ship an app, run a service or publish a library lets you spot a real problem early, ask a lawyer the right question, and not panic over a GPL badge on something you only run internally.',
    watch: 'Each package box shows its SPDX identifier as text, and its colour says what this way of shipping triggers: green means only notices are due, violet means copyleft is triggered, red means a likely conflict with your product licence or no licence at all, and a faded dashed box means nothing is triggered here. The yellow ring is the selected package. In the obligations table, a chip reads due (green notices, violet copyleft, red no permission), applies (blue, a benefit such as the Apache patent grant) or not triggered (faded). Product-licence chips are sky blue and licence palettes amber: plain categories, not verdicts. Compatibility chips read fine, whole under its terms, conflict or no permission.',
  },
  tryThis: [
    "Load the preset 'MIT app adds a GPL report-engine library': the library turns violet (copyleft likely triggered), because shipping an app triggers the GPL. Press Internal under 'How is it shipped?' and nothing is triggered.",
    "From that same preset, set the product's own licence to Proprietary: the report-engine library turns red, because a closed product can't offer the whole work under the GPL.",
    "Load 'AGPL database behind your SaaS', then flip 'We changed its files' to No and the box fades. Flip 'How it's used' to Built into our product and the whole service becomes the question.",
    "Load 'Relicensing your own project' and try Proprietary, then GPL-2.0-only, then MIT as the product licence. Compare which packages turn red.",
    "In The rule table, keep Apache-2.0 and read the product column: GPL-3.0-only is fine (the whole then carries GPL-3.0 terms) and GPL-2.0-only is a conflict. Then pick GPL-3.0-only and compare the other direction.",
  ],
  keyIdeas: [
    'Obligations are mostly triggered by distributing copies (or, for the AGPL, by network use of a modified version), not by using the code.',
    'Permissive licences ask for notices; Apache-2.0 adds a patent grant, a NOTICE file and a duty to mark changes.',
    'Compatibility is one-way and version-specific: Apache-2.0 into GPL-3.0 is fine, into GPL-2.0-only it is not.',
    'No licence means no permission. A licence scanner and an allow-list catch problems early, and lawyers settle the rest.',
  ],
  quiz: [
    {
      q: 'Your team runs an unmodified GPL-3.0 command-line tool only on its own servers and gives no copies to anyone. What does that use alone trigger?',
      options: [
        "Nothing: the GPL's conditions attach to distributing copies, not to running it",
        "A duty to publish all of your company's source code to anyone who asks for it",
        "A duty to offer the tool's source to every visitor of your company website",
        'A duty to relicense your own product under the GPL before the next release',
      ],
      answer: 0,
      why: 'GPL-3.0 conditions are triggered by conveying copies. Running a program internally is not conveying it, so nothing is due. (The AGPL adds a network clause, which is a different licence.)',
    },
    {
      q: "According to the FSF's compatibility list, which statement about Apache-2.0 code is correct?",
      options: [
        'It can join a GPL-3.0 work, but not a GPL-2.0-only one',
        'It can join GPL-2.0-only and GPL-3.0 works equally well, being permissive',
        'It can join a GPL-2.0-only work, but not a GPL-3.0 one',
        'It cannot join any GPL work, because its patent terms add restrictions',
      ],
      answer: 0,
      why: "The FSF lists Apache-2.0 as compatible with GPL-3.0, which was written to accept its patent terms, and incompatible with GPL-2.0-only, where those terms count as extra restrictions.",
    },
    {
      q: 'What does AGPL-3.0 add beyond the GPL-3.0?',
      options: [
        'A duty to offer source to network users of a version you modified',
        'A ban on any commercial use of the program by companies and individuals',
        'A requirement to register your product with the original licensor first',
        'A patent licence, which the GPL-3.0 text does not contain at all',
      ],
      answer: 0,
      why: "Section 13 of the AGPL-3.0: if you modify the program and users interact with it remotely, you must offer them the source of your modified version. It does not ban commercial use, and GPL-3.0 already has patent terms.",
    },
    {
      q: 'A useful snippet on a public web page carries no licence text. What is your position when you copy it into your product?',
      options: [
        'No permission by default, so ask the author or pick another snippet',
        'Free use, because anything publicly visible on a web page is free to use',
        'Allowed if you credit the author in a comment above the copied code',
        'Allowed as long as the product is only ever used internally by staff',
      ],
      answer: 0,
      why: "Without a licence, copyright's default applies: all rights reserved. Copying is itself a reserved right, so internal use does not help, and credit is not permission.",
    },
    {
      q: 'What does Apache-2.0 give you that MIT does not?',
      options: [
        'An express patent licence from contributors, ending if you sue over the Work',
        'Freedom from keeping any copyright notice in your distribution',
        'A promise that the code is free of defects and fit for purpose',
        "Permission to use the authors' names when promoting your product",
      ],
      answer: 0,
      why: 'Apache-2.0 section 3 grants a patent licence for contributions and terminates it for anyone who starts patent litigation over the Work. You still keep notices, and it gives no warranty or endorsement rights.',
    },
  ],
};

export default lesson;
