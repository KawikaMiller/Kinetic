import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A feature flag separates deploying code from releasing it: the code ships switched off, and a rule evaluated at runtime decides who sees it, so you can ramp up, target or switch off without another deploy.',
    what: 'A flag is a runtime condition around a code path. A percentage rollout hashes the flag name and the user id into a bucket from 0 to 99 and turns the feature on for buckets below the dial, so a user always gets the same answer and a ramp from 10% to 20% only adds users. Targeting rules are checked top to bottom and the first match decides. A kill switch is a flag you flip in an incident. Flags are code too: each one you leave in doubles the paths to test.',
    analogy: 'A light switch wired in before the lamp goes up: the electricians (deploys) can fit the wiring any day, and the switch decides when the room lights up and for whom.',
    useCases: [
      'Gradual rollouts to 1%, 10%, 50% and 100% of users, hashed so each user keeps their experience',
      'Kill switches for a risky or expensive path, flipped in an incident without a deploy',
      'Beta access and entitlements: show a feature to staff, one country or one plan',
      'Trunk-based development: merge unfinished work to main behind a flag that is off',
    ],
    why: 'Flags turn a launch into a dial and keep deploys boring. They also cost something: untested flag combinations, stale branches in the code and a flag service that has to be fast and safe when it fails. It builds on `deployment-strategies` (the deploy itself), `branching-workflows` (long-lived branches versus flags) and `hash-table` (a key hashed into a bucket).',
    watch: 'Users are tiny squares: violet sees the new checkout and blue the old one, as categories, not good and bad. In Targeting rules the code panel marks the rule that decided for the selected user in yellow, rules before it as asked, and rules after it dim because they were never reached; the selected user has a yellow ring. In the kill switch plot the violet curve is the flag flip and the orange one the rollback, and the dashed vertical line is the time you set. In Flag debt a stale flag gets an orange "remove me" badge, and the "Stale" number turns orange.',
  },
  tryThis: [
    'Drag the dial from 0% to 10%, then to 20%: every violet user at 10% is still violet at 20%. Then pick Random each request and press "Everyone loads another page" a few times to watch users flicker.',
    'At the default 0% the new build is already deployed and nobody sees it. Switch Code deployed to Old build and drag the dial: still nobody, because the flag code is not even there.',
    'Open Targeting rules and click different users: the yellow line is the rule that decided and the dim ones below it were never asked. Move "everyone else" to the top and watch it take every user.',
    'Open Kill switch and drag the clock to 0:30, then to 6:00: the flag flip has reached everyone, while the rollback is still partway through replacing servers.',
    'Open Flag debt, leave it at month 12 and press "Remove stale flags": the code shrinks and the combinations to test drop from 256 to 4.',
  ],
  keyIdeas: [
    'Deploy is not release: code can be live in production and seen by nobody until a rule says so.',
    'Hash the flag and user id into a bucket so a user\'s answer is stable and a ramp only adds users; a fresh random draw per request makes users flicker.',
    'Rules are first-match: a user who matches a rule gets its answer even when that answer is off, and later rules are never asked.',
    'Every flag is debt: delete release and experiment flags once they are done, keep kill switches on purpose, and test both states.',
  ],
  quiz: [
    {
      q: 'How does a percentage rollout keep a user\'s experience steady from one request to the next?',
      options: [
        'It hashes the flag and user id into a bucket and compares it with the dial',
        'It rolls a fresh random number for every request and compares it with the dial',
        'It switches the feature on for the users who signed up most recently',
        'It turns the feature on for the first tenth of servers that start up',
      ],
      answer: 0,
      why: 'The bucket depends only on the flag and the user, so the same user always gets the same answer. A fresh random draw per request is the mistake: in the lesson, about half the users change their answer between two rounds at 50%.',
    },
    {
      q: 'A flag is at 10% and you raise it to 20%. What happens to the users who already had the new feature?',
      options: [
        'They keep it, because a bucket below 10 is also below 20',
        'About half of them lose it, because every bucket is reshuffled',
        'They keep it only until the next deploy recomputes the hash',
        'They lose it until the new code has reached every server',
      ],
      answer: 0,
      why: 'The dial only moves the cut-off along the same 0 to 99 buckets, so ramping up adds users and never removes one. Changing the flag name would reshuffle every bucket, which is why keys stay fixed.',
    },
    {
      q: 'Rules: staff are on, country NL gets 50%, everyone else gets 10%. A Dutch user who is not staff is outside the 50%. Which rule decides?',
      options: [
        'country = NL: it matched first, so the default is never asked',
        'everyone else: it comes last and so has the final word on the user',
        'internal staff: it comes first, so it always decides for everyone',
        'None: when a percentage fails, the user falls to the next rule',
      ],
      answer: 0,
      why: 'Rules are first-match. The NL rule matched, so its 50% decided (off for this user) and the 10% default was never consulted; falling through would need a rule that does not match.',
    },
    {
      q: 'Why can a kill switch undo a bad release faster than rolling back the deploy?',
      options: [
        'It changes a rule clients re-read in seconds, with no build or server swap',
        'It deletes the new code from every server the moment it is flipped',
        'It works even where the risky code was never put behind a flag',
        'It restarts the servers faster than a normal rollback pipeline can',
      ],
      answer: 0,
      why: 'In the model every client picks up the flipped flag within 30 seconds, while a rollback spends 4 minutes in the pipeline and then 5 more replacing servers. The flag must already wrap the risky code, though: a kill switch cannot switch off something that was never behind one.',
    },
    {
      q: 'A team keeps adding flags and never deletes them. With 8 live flags, how many on and off combinations exist?',
      options: [
        '256, since each flag doubles the number of paths',
        '16, since each flag adds two more paths to the code',
        '64, since the flags are tested in groups of three',
        '8, since the flags are independent of each other',
      ],
      answer: 0,
      why: 'Each flag has two states, so n flags give 2 to the power n combinations: 256 for eight. Most are never exercised, which is why stale flags are removed and both states of the live ones are tested.',
    },
  ],
};

export default lesson;
