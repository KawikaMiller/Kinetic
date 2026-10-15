import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A repository layout moves coordination around instead of removing it: a monorepo trades build tooling for atomic change, and a polyrepo trades version bumps for independence.',
    what: 'You change a shared library in an invented system and play it out both ways. In a monorepo one commit changes the library and its callers and CI builds the affected set; in a polyrepo the library releases a new version and each consumer needs its own change, in dependency order, while repositories sit on different versions. Then you see what CI costs as a repository grows, write an ownership file and see who must review four pull requests, and finally move five situation sliders to see a ledger of both options lean each way. Every repository, number and review time is invented, and every claim says whether it is a standard, a common practice or one view.',
    analogy: 'Like keeping a family’s documents in one filing cabinet or in a drawer per person: one cabinet makes a joint change easy and needs a good index, separate drawers keep people independent and make shared updates a round of phone calls.',
    useCases: [
      'Deciding where a new service and its shared library should live',
      'Planning the order of version bumps when a shared library ships a breaking change',
      'Judging whether CI for a growing repository needs affected-set tooling',
      'Writing an ownership file so reviews find the right teams without needing five of them',
    ],
    why: 'Repository structure is expensive to change later and teams argue about it as if one layout were right. Seeing what each layout costs for a concrete change, and which factors tip the balance, lets you make the argument on the situation instead of on loyalty.',
    watch: 'In the graph the changed package is a solid yellow box, packages CI builds are orange, packages whose change landed or moved are green, a blocked one is red, a pending one is blue and an untouched one is faded grey. On the cost plot, green is the cheaper side (with affected-set detection) and red the costly side. In the ownership scene each team has its own plain colour and its name is always written beside it, and a path with no owner is red. In the ledger, green bars are what an option gives and red bars what it costs. Solid-bordered labels say whether a claim is a standard, a common practice or one view, and dashed chips say what is invented, simulated or simplified.',
  },
  tryThis: [
    'On Change a shared library, the opening state is a breaking rename in a monorepo: one commit, five packages built, and it lands whole. Switch Repository layout to Polyrepo: four repositories each need their own change and the last one lands on day 7.',
    'Pick Add an optional parameter: a monorepo still builds the affected set, but in a polyrepo the callers’ ^1.4.0 range accepts the minor release, so no repository needs a change.',
    'On The bill, 100 packages cost far fewer CI minutes with affected-set detection than without. Drag the size to 500 and compare the two stats again: the gap widens.',
    'On Who owns what, most paths start red with no owner. Pick @platform and press Add or replace rule with the pattern /api/: the four api paths gain an owner and the rename pull request lists @platform as a reviewer.',
    'On It depends, set independent release cadence and access control to 100%: the ledger leans polyrepo. Then set shared code to 100% and those two back to 0%: it leans monorepo.',
  ],
  keyIdeas: [
    'A repository layout moves coordination, it does not remove it: a monorepo trades build tooling for atomic change, and a polyrepo trades version bumps for independence.',
    'In a polyrepo a breaking change to a shared library becomes a series of changes in dependency order, and the repositories sit on different versions until the last one moves.',
    'A monorepo does not have to build the whole repository for each change: the affected set, the packages that can reach it, keeps CI in proportion, and that tooling is a cost of its own.',
    'Neither layout wins in general. Shared code, team count, release cadence, tooling capacity and access control decide, and a ledger of both costs and benefits shows which way a situation leans.',
  ],
  quiz: [
    {
      q: 'Teams keep separate repositories so each can release on its own. A shared library ships a breaking release. What follows?',
      options: [
        'Each repository needs its own change to move up, and until it does the repositories use different versions',
        'Nothing is needed, because separate repositories are unaffected by each other’s breaking changes or releases',
        'One commit updates every repository together, since they share the library',
        'The library cannot ship a breaking version while other repositories depend on it',
      ],
      answer: 0,
      why: 'A caret range keeps the major version, so a major release needs a change in each consumer. That coordination is what independence costs, and the repositories are mixed until the last one moves.',
    },
    {
      q: 'A teammate says a monorepo means a monolith that anyone can break. What is the fair reply?',
      options: [
        'A monorepo is how code is stored, not how it is built, so components stay separate with owners and scoped CI',
        'That is right, because one repository means one codebase that everyone edits, builds and releases together as a unit',
        'That is wrong, because a monorepo hides all code from the engineers outside the owning team',
        'That is right only until the repository grows past a few dozen packages, which tooling then fixes',
      ],
      answer: 0,
      why: 'Layout and architecture are separate choices. Ownership rules and affected-set CI are how a monorepo keeps components apart, and they are costs the monorepo has to pay.',
    },
    {
      q: 'The library adds an optional parameter and callers pin ^1.4.0. In the polyrepo, what does the change need?',
      options: [
        'A pull request in each of the four repositories, in dependency order',
        'No repository needs a change: the caret range accepts the new minor release',
        'A major release, since any change to a shared function counts as breaking',
        'One commit that updates every repository together before the release',
      ],
      answer: 1,
      why: 'Adding an optional parameter keeps existing callers working, so it is a minor release and a caret range accepts it. A breaking change is what needs the cascade.',
    },
    {
      q: 'In this lesson’s ownership file, `*` is owned by @platform and a later rule gives /billing/ to @payments. Who owns /billing/src/tax.ts?',
      options: [
        '@platform, because the first rule that matches takes the file',
        'Neither team, because overlapping rules cancel each other out',
        '@payments, because the last matching rule wins',
        '@platform, because a rule for * outranks a directory rule',
      ],
      answer: 2,
      why: 'In the lesson’s simplified file, as in GitHub’s from memory, the last matching rule wins, so a specific rule placed after a broad one takes precedence.',
    },
  ],
};

export default lesson;
