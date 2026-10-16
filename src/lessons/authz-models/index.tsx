import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An authorization model is a way of writing down who may do what to which thing: an ACL lists names on each document, RBAC hands out roles, ABAC compares attributes, and ReBAC follows relationships, and none of them is best without a stated requirement.',
    what: 'The lesson asks one question, such as "may Alice read the design notes?", of a small invented company under four models, and lights the path each one walks to its answer. A denial shows the missing link or the failed comparison. You can change a person\'s department and clearance, move a document to another folder, share one document for a week, and close a loop in the groups. A table lists every question under every model and marks where they disagree with a stated rule, a counting scene shows what an administrator writes down for the same rule in each model, and a last scene shows what happens when a permit and a deny both match.',
    analogy: 'Four ways to run a building\'s keys: a list at each door, a coloured badge per job, a guard who checks your pass against the room\'s rules, or a map of who vouches for whom.',
    useCases: [
      'Choosing how a new product decides who may see which record',
      'Explaining why a role grew into hundreds of near-duplicates',
      'Sharing one document for a week without redesigning the permissions',
      'Reading a policy engine\'s documentation and knowing which model it is built on',
    ],
    why: 'Most access bugs are not broken checks but a model that cannot say what the business means, so people patch it with exceptions. Knowing what each model expresses cheaply and what it forces you to repeat is how you pick one and how you spot the exceptions piling up.',
    watch: 'In the path drawing the path that granted is green (--ok) and an edge or node that was considered and failed is red (--bad); a listed entry that did not match is grey (--dim). The coloured bar on a node is a plain category: users sky, groups amber, roles pink, resources orange, and a rule or condition violet. In the disagreement table a yellow row (--hi) is one where the models disagree and a red answer is a model that differs from the stated requirement. In the counting scene the flat form is red and the fair form green. In the combining scene permit is green and deny red, and the row for your two rules is yellow.',
  },
  tryThis: [
    `Ask, on the defaults (ACL, Alice reads Design notes, granted): the lit path has ${F.aclEdges} edge. Switch the model to RBAC: ${F.rbacEdges} edges, to ABAC: ${F.abacEdges}, to ReBAC: ${F.rebacEdges}. The answer is the same and the path is not.`,
    `Ask, on the defaults: pick Bob and the Roadmap. ACL says "${F.bobRoadmapAcl}" Press "Share the Roadmap with Erin", pick Erin: read is ${F.erinReadAfterShare ? 'granted' : 'denied'} and edit is ${F.erinEditAfterShare ? 'granted' : 'denied'}.`,
    `Disagreements, from the default organisation (press "Reset organisation" first): the table is quiet. Switch "Engineering clearance groups" to a loop: ${F.wrongAfterLoop} rows differ from the requirement, all in ReBAC. Switch it back and share the Roadmap: ${F.wrongAfterShare} row differs, in all four models, until you pick the second requirement.`,
    `Counting, on the defaults (${F.departments} departments, ${F.levels} levels): flat RBAC needs ${F.roles} roles, the hierarchical form ${F.hierRoles} roles and ${F.hierEdges} inheritance edges, ABAC ${F.policies} policy. Slide to 6 departments and 4 levels: ${F.bigRoles} flat roles. Pick the second requirement and every model needs one change.`,
    `Combining, on the defaults (rule 1 ${F.rule1}, rule 2 ${F.rule2}, deny overrides): the decision is ${F.defaultDecision}. Choose permit overrides: ${F.permitOverrides}. Choose first applicable: ${F.firstApplicable}. Press "Swap the order": ${F.firstApplicableSwapped}.`,
  ],
  keyIdeas: [
    `The same requirement can be written in each model, and on the default organisation, with configurations generated from the rule, all four give the same ${F.questions} answers; what differs is what you write down: for ${F.departments} departments and ${F.levels} levels, ${F.roles} flat roles, ${F.policies} ABAC policy, or ${F.groups} groups and ${F.folders} folders.`,
    `A model is right or wrong against a stated requirement, not by itself: with a loop in the clearance groups, the groups become one group and low-clearance members inherit the top group's access, so ${F.wrongAfterLoop} rows differ from the rule in ReBAC, and the disagreement table shows where.`,
    'A role is a named bundle of permissions that people are assigned, not a permission itself: flat roles grow as departments times levels, and the fair form adds inheritance edges between roles instead.',
    `A relationship checker needs a visited set: with a loop the broken version ran past ${F.budget} steps, and the honest one answered in ${F.honestSteps} and said the cycle was ignored.`,
  ],
  quiz: [
    {
      q: 'You need "managers can approve expenses for their direct reports". Which approach handles it without a role for each manager?',
      options: [
        'Give every manager one shared Manager role, which then lets any manager approve for anyone',
        'Record who reports to whom and check that link, as a relationship model does',
        'Raise the clearance of every manager, since approving is just reading at a higher level',
        'Add a deny rule for people who are not managers, which still names no one\'s reports',
      ],
      answer: 1,
      why: 'The fact that matters is a link between two people, so storing and checking that link (ReBAC) fits; an attribute naming each person\'s manager (ABAC) would also work. A shared role approves for everyone, and a role per manager is the pattern the question rules out.',
    },
    {
      q: 'Alice is in group A, group A is in group B, and group B is in group A. What does a correct checker do?',
      options: [
        'It follows each group once, skips the repeat, and still answers the question',
        'It rejects any check that touches the loop with an error, so nobody can be granted access',
        'It keeps walking the loop until a step limit and then permits, to avoid blocking anyone',
        'It merges the two groups into one and denies everyone who was in either of them',
      ],
      answer: 0,
      why: `A visited set stops the walk, and the answer is still correct for the data it was given: a loop makes the groups one group, so the data, not the checker, is what to fix. In this model the honest check answered in ${F.honestSteps} steps, while the version without one ${F.brokenExceeded ? 'ran past' : 'stayed under'} the ${F.budget}-step budget.`,
    },
    {
      q: 'In RBAC, what is a role?',
      options: [
        'A permission itself, with one role for each action on each kind of thing',
        'A named bundle of permissions that people are assigned, so a person can hold several',
        'An attribute on a user that a policy compares with an attribute on the document',
        'A tuple that says one object is related to another, such as a parent folder',
      ],
      answer: 1,
      why: 'A role groups permissions so they can be assigned together. In this model a person holds one flat role for each clearance up to their own, which is why the flat form needs a role for every department and level.',
    },
    {
      q: 'A permit rule and a deny rule both match. Which combining rule gives permit?',
      options: [
        'Deny overrides, because the deny rule was written to protect the resource',
        'First applicable, whenever the deny rule happens to be listed first',
        'Permit overrides, because any matching permit wins over a matching deny',
        'Every one of them, because at least one rule matched and permitted the request',
      ],
      answer: 2,
      why: `In this model rule 1 permits and rule 2 denies: deny overrides gives ${F.defaultDecision}, permit overrides ${F.permitOverrides}, and first applicable ${F.firstApplicable} with the permit listed first and ${F.firstApplicableSwapped} after the swap.`,
    },
  ],
};

export default lesson;
