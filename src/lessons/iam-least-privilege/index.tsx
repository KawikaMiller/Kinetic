import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Give every service the smallest set of permissions that still works, and credentials that expire on their own. A policy is evaluated as explicit deny, then allow, then deny by default, and the damage a stolen role can do is exactly what its policy allows.',
    what: 'A cloud policy is a list of statements that Allow or Deny actions on resources, matched with wildcards. The check runs in a fixed order: any matching Deny wins, otherwise any matching Allow lets it through, otherwise the answer is no. Least privilege (see `security-principles`) means writing statements from what the service really does, such as an access log, instead of from `*`. Short-lived credentials (see `secrets-management`) cap how long a leaked copy is useful: a 15-minute role session or a per-deploy vault credential dies by itself, while a key in a config file lives until someone rotates it.',
    analogy: 'A hotel key card opens your room and the gym, and stops working at checkout. A master key that never expires opens everything for whoever finds it.',
    useCases: [
      'Writing the policy for a new service role, and trimming one that grew to `*`',
      'Debugging "access denied": a typo in a resource pattern or an explicit Deny somewhere',
      'Replacing access keys in config files with assumed roles and per-deploy credentials',
      'Reviewing what a compromised service could reach before choosing how far to split an account',
    ],
    why: 'Many cloud breaches are not clever: a credential leaked and the role behind it could do far more than the service ever needed. Writing narrow policies and using short-lived credentials are the two habits that turn that leak from a disaster into a footnote, and "access denied" debugging needs the evaluation order in your head.',
    watch: 'Scene 1: the request is blue; the statement being checked has a yellow outline and a number showing the order the rule looked at it; a matching Allow turns green, a matching Deny turns red, and statements that do not match go dashed and dim. Scene 2: the role is a box (orange when compromised); resources it can reach are tinted blue, or red once the role is compromised, and the ones it cannot reach are grey. The small number on each is allowed actions out of all that exist, and a purple dot marks resources the service really used in the last 90 days. Scene 3: bars are credentials over time (blue in normal use); the orange marker is the copy to a laptop; the part of a credential after it turns red while the copy still works and grey once it has expired.',
  },
  tryThis: [
    'In scene 1 press Play on "Works", then load "Deny overrides allow": the Allow would match, but the walk stops at the Deny, which wins. Then try "Typo in resource".',
    'In scene 2 (policy "storage:* on *"), press Compromised: the buckets light up red. Then choose "Allow * on *": the radius floods.',
    'In scene 2, choose "Suggested from the 90-day log" and compromise the role: only what the service used is left to reach, and the service still works (a check against the same log, so it cannot fail here; a real log can miss a quarterly job).',
    'In scene 2, choose "Allow storage:GetObject on bucket/reports/*": the radius is tiny but "Service still works" turns to no. Narrow is not the same as right.',
    'In scene 3, press "Restart the clock" and watch: the copied access key stays red while the role and vault copies go grey. Slide the vault rotation to 30 min and compare.',
  ],
  keyIdeas: [
    'Evaluation order: an explicit Deny wins, then any Allow, otherwise denied by default.',
    'The blast radius of a compromised role is everything its policy allows, not only what the service calls.',
    'Write policies from observed use (an access log), then check the service still works. A 90-day log misses quarterly or yearly jobs, so review before trimming.',
    'Short-lived credentials turn a leak into minutes of exposure instead of months.',
  ],
  quiz: [
    {
      q: 'A teammate wants the service role to have storage:* on everything, because "the service only calls what it needs". What is wrong with that?',
      options: [
        'The role can only use the actions it lists, so a wildcard policy is harmless',
        'A stolen role lets an attacker do everything it allows, not just what the service calls',
        'Wildcard policies stop the service working as soon as more buckets are added to the account',
        'Cloud providers refuse to attach wildcard policies to any role that a service will use',
      ],
      answer: 1,
      why: 'What the service happens to call is irrelevant to someone who steals its credential: they can use every permission the role has. The wildcard does not break the service, and providers accept it, which is why it spreads. Writing the policy from what the service really used is the fix.',
    },
    {
      q: 'A policy has `Allow storage:* on bucket/*` and `Deny storage:Delete* on bucket/*`. A request to delete bucket/reports/q3.csv arrives. What happens?',
      options: [
        'Allowed, because the Allow is listed first and so it wins',
        'Allowed, because storage:* is broader than the Deny pattern',
        'Denied, because an explicit Deny beats any Allow',
        'Denied, but only when the Deny is written above the Allow',
      ],
      answer: 2,
      why: 'Evaluation does not go by order or by how broad a pattern is: any matching Deny decides, whatever Allows also match. That is what makes a Deny a safe guard rail on top of a broad Allow.',
    },
    {
      q: 'A role gets "access denied" reading bucket/reports/q3.csv. Its only statement is Allow storage:GetObject on bucket/report/*. Why?',
      options: [
        'Another policy must contain an explicit Deny for that particular bucket',
        'Patterns only match the first folder level, never the names below it',
        'A typo in the resource pattern: nothing matches, so the default is deny',
        'GetObject can only be allowed together with PutObject on that bucket',
      ],
      answer: 2,
      why: 'The pattern says "report", not "reports", so no statement matches. With no matching Allow the request is denied by default, which looks the same as a Deny from outside. A * crosses folder levels here, so depth is not the problem.',
    },
    {
      q: 'An access key in a config file and a new 15-minute role session are both copied to a laptop right away. Ten minutes later, what is true?',
      options: [
        'Both copies still work, because neither one has been revoked yet',
        'Both copies are dead, since the leak was noticed in good time',
        'Only the key copy has expired, because keys carry shorter lifetimes',
        'The key copy works; the role session has five minutes left',
      ],
      answer: 3,
      why: 'An access key has no expiry until someone rotates it, so the copy keeps working. The role session expires on its own after 15 minutes, so five minutes of the copy remain. Nobody had to notice anything for the role to stop working.',
    },
  ],
};

export default lesson;
