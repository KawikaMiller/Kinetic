// The scripted refinement session behind the lesson: a vague request, a deck of
// clarifying questions, and what each answer turns into. Pure data and rules, tested.

export const REQUEST = 'Users should be able to reset their password.';

export interface Criterion {
  /** Scenario name, also the name of its test. */
  name: string;
  given: string;
  when: string;
  then: string;
}

export type QuestionKind = 'criterion' | 'scope' | 'irrelevant';

export interface Question {
  id: string;
  /** What you ask. */
  text: string;
  /** Short label for the open ambiguity orbiting the request. */
  ambiguity: string;
  kind: QuestionKind;
  /** The product owner's answer, as said in the meeting. */
  answer: string;
  criterion?: Criterion;
  /** The explicit out-of-scope line, for scope questions. */
  scope?: string;
  /** What it costs at the demo if nobody asked (illustrative days). */
  reworkDays: number;
  /** How skipping it shows up later. */
  surprise: string;
}

export const QUESTIONS: Question[] = [
  {
    id: 'expiry', text: 'How long is the reset link valid?', ambiguity: 'link expiry?', kind: 'criterion',
    answer: '60 minutes. After that you have to ask for a new one.',
    criterion: {
      name: 'Expired link is refused',
      given: 'I requested a reset 61 minutes ago',
      when: 'I open the link',
      then: 'I see "This link has expired" and a button to send a new one',
    },
    reworkDays: 0.5, surprise: 'Demo: "So these links work forever?" Expiry gets added after the fact.',
  },
  {
    id: 'unknown', text: 'What if the email isn\'t registered?', ambiguity: 'unknown email?', kind: 'criterion',
    answer: 'Show the same message either way, so nobody can find out who has an account.',
    criterion: {
      name: 'Unknown email reveals nothing',
      given: 'no account uses sam@example.com',
      when: 'I request a reset for sam@example.com',
      then: 'I see "If an account exists, we\'ve emailed a link", the same as for a real account, and no email is sent',
    },
    reworkDays: 1, surprise: 'After release: a security scan finds the page says "no such user", leaking who has accounts.',
  },
  {
    id: 'rate', text: 'Can someone spam reset requests?', ambiguity: 'spam / abuse?', kind: 'criterion',
    answer: 'At most 3 requests per account per hour.',
    criterion: {
      name: 'Too many requests are limited',
      given: 'I have requested 3 resets in the last hour',
      when: 'I request another',
      then: 'I see "Try again in a few minutes" and no email is sent',
    },
    reworkDays: 1, surprise: 'Week 2: a bot sends 40,000 reset emails and the email provider suspends the account.',
  },
  {
    id: 'single', text: 'Can the same link be used twice?', ambiguity: 'reuse a link?', kind: 'criterion',
    answer: 'No. Once a link has set a password, it\'s dead.',
    criterion: {
      name: 'A used link cannot be reused',
      given: 'I already set a new password with this link',
      when: 'I open the link again',
      then: 'I see "This link has already been used"',
    },
    reworkDays: 0.5, surprise: 'Review: an old link in a forwarded email still changes the password.',
  },
  {
    id: 'rules', text: 'What counts as a valid new password?', ambiguity: 'password rules?', kind: 'criterion',
    answer: 'At least 12 characters, and not one of your last 5.',
    criterion: {
      name: 'Weak or reused passwords are rejected',
      given: 'I am choosing a new password',
      when: 'I enter one shorter than 12 characters or one of my last 5',
      then: 'it is rejected and I am told which rule it broke',
    },
    reworkDays: 0.5, surprise: 'Demo: "Why did it accept \'abc\'?" The sign-up rules weren\'t applied here.',
  },
  {
    id: 'sessions', text: 'Should other devices be signed out after a reset?', ambiguity: 'other sessions?', kind: 'criterion',
    answer: 'Yes: if someone else got in, a reset must kick them out.',
    criterion: {
      name: 'A reset signs out other sessions',
      given: 'I am signed in on my laptop',
      when: 'I reset my password on my phone',
      then: 'my laptop session is signed out',
    },
    reworkDays: 1, surprise: 'Incident: a user resets after a breach, but the attacker\'s session keeps working.',
  },
  {
    id: 'sso', text: 'What about people who sign in with Google?', ambiguity: 'SSO users?', kind: 'criterion',
    answer: 'They have no password here. Point them to Google.',
    criterion: {
      name: 'Google sign-in accounts are sent to Google',
      given: 'my account signs in with Google',
      when: 'I request a password reset',
      then: 'I see "You sign in with Google" and a link to Google\'s account recovery',
    },
    reworkDays: 1, surprise: 'Support tickets: Google users get reset emails for a password they never had.',
  },
  {
    id: 'sms', text: 'Should it also work by text message (SMS)?', ambiguity: 'SMS?', kind: 'scope',
    answer: 'Not in this story. Maybe later.',
    scope: 'Reset by SMS: a separate story, not this one.',
    reworkDays: 2, surprise: 'Sprint review: sales promised SMS reset to a customer; two days of argument and rework.',
  },
  {
    id: 'devices', text: 'Which devices does it need to work on?', ambiguity: 'which devices?', kind: 'scope',
    answer: 'Desktop and mobile browsers. The native app comes later.',
    scope: 'Native mobile app deep links: out of scope (web only for now).',
    reworkDays: 1, surprise: 'QA: "The link opens a blank screen in the iOS app." Nobody knew if that was in scope.',
  },
  {
    id: 'font', text: 'Which font should the email use?', ambiguity: '', kind: 'irrelevant',
    answer: 'Use the usual brand template.', reworkDays: 0, surprise: '',
  },
  {
    id: 'colour', text: 'What colour is the reset button?', ambiguity: '', kind: 'irrelevant',
    answer: 'Whatever the design system says.', reworkDays: 0, surprise: '',
  },
  {
    id: 'rewrite', text: 'Should we rewrite the login page while we\'re at it?', ambiguity: '', kind: 'irrelevant',
    answer: 'No, that\'s a separate project.', reworkDays: 0, surprise: '',
  },
];

/** Questions whose answer changes what "done" means. */
export const MATERIAL = QUESTIONS.filter((q) => q.kind !== 'irrelevant');
export const question = (id: string) => QUESTIONS.find((q) => q.id === id)!;

/** Fraction of material ambiguities still open, from 1 (nothing asked) down to 0. */
export function ambiguity(asked: ReadonlySet<string>): number {
  return MATERIAL.filter((q) => !asked.has(q.id)).length / MATERIAL.length;
}

export const criteriaFor = (asked: readonly string[]) =>
  asked.map(question).filter((q) => q.kind === 'criterion').map((q) => q.criterion!);
export const scopeFor = (asked: readonly string[]) =>
  asked.map(question).filter((q) => q.kind === 'scope').map((q) => q.scope!);

/** One test per acceptance criterion: the criterion's scenario name. */
export const testsFor = (asked: readonly string[]) => criteriaFor(asked).map((c) => `test: ${c.name.toLowerCase()}`);

/** A criterion as Gherkin lines. */
export function gherkin(c: Criterion): string[] {
  return [`Scenario: ${c.name}`, `  Given ${c.given}`, `  When ${c.when}`, `  Then ${c.then}`];
}

/** Words that make an acceptance criterion untestable. */
export const VAGUE_WORDS = ['fast', 'quickly', 'easy', 'easily', 'user-friendly', 'intuitive', 'properly', 'appropriate', 'secure', 'robust', 'etc'];
export const isTestable = (c: Criterion) => !VAGUE_WORDS.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(`${c.given} ${c.when} ${c.then}`));

export const STORY = {
  asA: 'a user who has forgotten my password',
  iWant: 'to reset it from a link in my email',
  soThat: 'I can get back into my account without contacting support',
};

export const DEFINITION_OF_DONE = ['Code merged', 'Tests for every criterion pass', 'Code reviewed', 'Docs and support notes updated', 'Deployed to production'];

// ── "What happens if we skip this" (illustrative numbers) ─────────────────

export const BUILD_DAYS = 5;
export const REFINEMENT_DAYS = 0.5;

export interface SkipCost {
  /** Days if the team builds straight from the vague request. */
  skipped: number;
  /** Days if the team refines first (refinement + build). */
  refined: number;
  rework: number;
}

/** Cost of building without asking the given questions vs refining first. */
export function skipCost(unasked: readonly Question[] = MATERIAL): SkipCost {
  const rework = unasked.reduce((sum, q) => sum + q.reworkDays, 0);
  return { rework, skipped: BUILD_DAYS + rework, refined: REFINEMENT_DAYS + BUILD_DAYS };
}
