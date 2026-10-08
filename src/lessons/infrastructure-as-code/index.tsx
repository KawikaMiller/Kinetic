import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'With infrastructure as code you declare the world you want; the tool diffs that against what it last recorded and what really exists, shows a plan, and only then applies it.',
    what: 'A config file describes resources and how they refer to each other. The tool keeps a state file: the ids and attributes it created last time. To plan, it first refreshes the state from the real cloud (which finds drift, changes made by hand), then diffs the config against that. Each resource is created, updated in place, replaced (destroyed and created again, when an attribute can\'t change in place, such as a VM image) or destroyed, and the plan names the attribute that caused it. Apply runs the plan in dependency order, worked out from the references, and a second plan right after is empty: that is what idempotent means here.',
    analogy: 'A building inspector with a checklist and a blueprint. The blueprint is your config, the checklist is the state file, and the building is the real cloud. The inspector walks the building first, then lists what to build, change or tear down before any work starts.',
    useCases: [
      'Creating the same network, VMs and DNS for staging and production from one reviewed file',
      'Reviewing a plan in a pull request, where a replacement or destroy stands out before anyone approves it',
      'Finding out that someone changed a setting in the console, and putting it back with the next apply',
      'Recovering from a lost or corrupted state file without creating duplicates of everything (by importing the existing objects into state or restoring a backup)',
    ],
    why: 'Mid-level engineers change production infrastructure through files, and the dangerous mistakes are exactly the ones a plan shows: a rename that destroys a database, a change that cascades to every VM, a state file that no longer matches reality. It builds on `ci-pipelines` (plans run in review and apply in a pipeline), `data-formats` (a config is structured text with a grammar) and `git-internals` (the config lives in version control). Continuous reconciliation straight from git is a later topic.',
    watch: 'Three panes: Config is the text you edit, State is what the tool last recorded, and Real world is the simulated cloud; an orange outline on an attribute means the cloud differs from what the state recorded, and a dashed orange box is an object the state doesn\'t know. In the plan, green + is a create, yellow ~ an update in place, orange -/+ a replacement (and orange is also drift), and red - a destroy; each changed attribute is listed under its resource. In the graph, boxes are resources and arrows point from a dependency to what depends on it: blue is a normal resource, the plan tints each box by its action (green, yellow, orange, red, or dim for no change), the solid yellow box is the step being applied now, a box turns blue once its step ran, a failed one red and a skipped one dim.',
  },
  tryThis: [
    'From the default Fresh start, press Plan and read five green creates, then Approve and apply and watch the graph: the network is built first, then the VMs and the rest.',
    'Pick Rename a VM and press Plan: one orange -/+ replacement caused by the name, and the review box names the destroy before you approve.',
    'Pick Console drift and press Plan: an orange drift line shows the size changed by hand, and the plan updates it back in place.',
    'Pick Change the CIDR and press Plan: one network change replaces both VMs and updates the DNS record.',
    'Pick Lost state file, press Plan and approve: it plans to create everything again, the network and bucket collide with what exists, and what depends on them is skipped.',
  ],
  keyIdeas: [
    'Declarative: you state the end result and the tool works out the steps, unlike a script that lists them.',
    'Plan diffs the config against the state and the refreshed real world; it changes nothing until you approve and apply.',
    'Some attributes force replacement, and a replacement cascades to everything that must be recreated with it.',
    'The state file is how the tool knows which real objects are its own: lose it and plan wants to create everything again.',
  ],
  quiz: [
    {
      q: 'Apply creates a VM and the network it uses. In what order does it run them?',
      options: [
        'The network first, because the VM refers to it',
        'Top to bottom, in the order the blocks are written',
        'Alphabetically by resource type and then name',
        'All together, since the order never matters',
      ],
      answer: 0,
      why: 'The tool builds a dependency graph from the references between resources and applies in an order where dependencies come first. The order in the file is irrelevant, and unrelated resources can go in any order.',
    },
    {
      q: 'The config declares a VM that already exists in the cloud, but the state file was lost. What does plan show?',
      options: [
        'A create, since the state has no record of it',
        'No changes, since the cloud already matches the config',
        'An in-place update to adopt the existing VM',
        'An error: a plan cannot run without a state',
      ],
      answer: 0,
      why: 'The tool decides what exists from its state, not from the config or by searching the cloud. With nothing recorded it plans a create, and the apply then either fails on a name that is already taken (a bucket) or silently makes a duplicate of the real VM.',
    },
    {
      q: 'A plan marks a VM -/+. What does that mean?',
      options: [
        'It is destroyed and then created again from scratch',
        'It stays as it is, and only its tags are rewritten',
        'One attribute is removed and another is added to it',
        'It is copied and the copy is added next to the original',
      ],
      answer: 0,
      why: 'A replacement is a destroy plus a create, used when an attribute such as the image or the name can only be set when the resource is made. The plan lists the attribute that forces it so the destroy is not a surprise.',
    },
    {
      q: 'Why is it safe to run apply twice in a row?',
      options: [
        'The second plan finds no differences, so nothing runs',
        'The tool deletes and recreates everything each time, to be sure',
        'The state file locks the cloud after the first run',
        'Apply skips the config once it has run before',
      ],
      answer: 0,
      why: 'Apply makes the real world match the config, so a second plan diffs equal things and is empty. That property is idempotence: the same config gives the same result however many times you apply it.',
    },
    {
      q: 'Someone resizes a VM in the cloud console. What does the next plan do?',
      options: [
        'Shows the size drifted and plans an update back to the config',
        'Shows nothing at all, since the state file still says it is small',
        'Rewrites the config file so that it matches the console',
        'Destroys the VM because it was changed outside the tool',
      ],
      answer: 0,
      why: 'Plan refreshes the state from the real cloud first, so it sees the new size, compares it with the config and plans an in-place update to revert it. It never edits your config, and a size change does not force a replacement.',
    },
  ],
};

export default lesson;
