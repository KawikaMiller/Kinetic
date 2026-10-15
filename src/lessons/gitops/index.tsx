import type { LessonModule } from '../../core/types';
import { DESIRED_START, LOAD_SPIKE, REPLICA_CAPACITY } from './reconcile';
import { DOWN_FROM, DOWN_UNTIL, SCRIPT_END, runScript, verdict } from './script';
import { Stage } from './Stage';
import { failingShare, initWorld, manual, toNextRun } from './world';

const driftWindow = toNextRun(manual(initWorld({ interval: 10 }), 'web-svc', null, 'x')).driftSeconds;
const handScaled = 10;
const reverted = failingShare(DESIRED_START, true);
const ends = (handler: 'edge' | 'level') => {
  const f = runScript({ handler, restart: true, prune: true })[SCRIPT_END];
  return verdict(f.desired, f.live);
};
const edgeEnd = ends('edge');

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'GitOps keeps git as the desired state and runs a controller that compares it with the cluster over and over, so a hand-made change is put back and a missed event does not matter.',
    what: `A toy controller compares git (three deployments and a service) with a simulated cluster every few seconds and applies one change per run. You edit git and commit, then change the cluster by hand and watch it drift, and see the sync interval set how long it stays that way. In an incident you scale by hand under a traffic spike and the controller puts it back, so you learn the two honest ways out: commit the change, or pause sync as a logged override. Last, an edge-triggered handler that reacts only to events ends wrong when its controller restarts, and a level-triggered one that compares everything ends right. It is a toy: no API server, no real manifests.`,
    analogy: 'Like a thermostat rather than a light switch: you do not flip it once when you change the setting, it keeps comparing the room with the number you set and corrects the difference.',
    useCases: [
      'Changing a deployment by committing to git and letting a controller apply it',
      'Finding out that someone fixed production by hand, because the cluster no longer matches git',
      'Deciding whether to pause automatic sync during an incident, and what that leaves unwatched',
      'Understanding why controllers compare the whole state rather than react to single events',
    ],
    why: 'A controller that keeps comparing state is what makes a cluster self-healing and git a record of what should be running. Knowing that loop explains why a hand-made fix does not last, and how to make a change stick.',
    watch: 'Each row is one resource: git on the left in blue, the cluster on the right. A green card is live and in sync, a red one has drifted, a grey dashed one has not been created yet, an orange one is an orphan git no longer has, and a yellow ring marks what the controller just did; violet marks sync paused on purpose. In the diff, a green plus line is what the next sync will make and a red minus line is what is live now. Dashed chips say what is a toy or simulated; solid-bordered labels say a claim is standard or common practice.',
  },
  tryThis: [
    'On The loop, press + on web twice and Commit: the diff shows web going from 3 replicas to 5, and within a second the controller updates it, one action per run.',
    `On Drift, press Delete the service, then To the next sync: the service is recreated, and the Out of sync counter reads ${driftWindow} s because the sync interval is 10 seconds.`,
    'On Drift, turn Auto-sync off and add a replica to web by hand: it stays drifted, and the log says out of sync once instead of fixing it.',
    `On The incident trap, press Spike: ${Math.round(reverted * 100)}% of requests fail with ${DESIRED_START.web.replicas} replicas. Scale web to ${handScaled} by hand and none fail, until the controller’s next run puts web back and ${Math.round(reverted * 100)}% fail again. Commit web = ${handScaled} instead and none do.`,
    `On Level-triggered, step to the last second with the edge-triggered controller restarting: it ends wrong (${edgeEnd.wrong.join(' and ')}). Switch to Level-triggered and step to the end again: it ends right.`,
  ],
  keyIdeas: [
    'A controller is a loop that compares the whole desired state with the live one, not a script that runs once on a commit.',
    'In this model a hand-made change lasts until the next sync, which is why the interval sets the length of the drift.',
    'The honest ways to keep an incident fix are to commit it to git or to pause sync as a logged override; fighting the loop loses.',
    'A level-triggered loop converges after it misses events, where an edge-triggered handler that missed one stays wrong.',
  ],
  quiz: [
    {
      q: 'You scale a deployment by hand during an incident, and auto-sync is on. What happens next?',
      options: [
        'Nothing, because the controller only reacts to commits and never looks at the cluster at all',
        'At its next run the controller sees the cluster differs from git and puts the old value back',
        'The controller copies the hand-made change into git for you, so that the two match again',
        'The cluster keeps the new value, because a resource that is running is never overwritten by git',
      ],
      answer: 1,
      why: `The loop compares git with the cluster at each run. In this model web goes back from ${handScaled} to ${DESIRED_START.web.replicas} replicas and ${Math.round(reverted * 100)}% of requests fail at the spike (${REPLICA_CAPACITY} per replica against ${LOAD_SPIKE}).`,
    },
    {
      q: 'Why does a reconciliation controller compare the whole state on each run instead of reacting to events?',
      options: [
        'It saves work, because comparing everything is always cheaper than reading a single event',
        'It is required by git, which has no way to send an event when one of its files changes',
        'A missed event is never seen again, but a full comparison still finds the difference',
        'It lets the controller skip git altogether and read the desired state from the cluster itself',
      ],
      answer: 2,
      why: `With the controller down from second ${DOWN_FROM} to ${DOWN_UNTIL - 1}, the edge-triggered handler ends wrong (${edgeEnd.wrong.join(' and ')}) and the level-triggered one ends right on the same events.`,
    },
    {
      q: 'A resource is removed from git, and pruning is off. What happens to it in the cluster?',
      options: [
        'It is deleted at the next sync, because git no longer has it',
        'It stays running, reported as an orphan that nothing owns any more',
        'It is moved back into git, so that the two sides match again',
        'It is paused until someone commits it back to git',
      ],
      answer: 1,
      why: 'The controller deletes what git no longer lists when pruning is on. With pruning off it leaves the resource alone and reports it, so a removed resource can keep running unnoticed.',
    },
    {
      q: 'What does the pull style of GitOps change about credentials?',
      options: [
        'The cluster credentials stay inside the cluster, where an agent reads git and applies it',
        'The pipeline holds the cluster credentials, because it has to reach in from outside to apply the change',
        'Git holds the cluster credentials, since it is the source of the desired state for everything',
        'There are no credentials, because the controller never changes anything',
      ],
      answer: 0,
      why: 'A pull agent inside the cluster reads git, so git needs no way in. A push job from CI has to hold credentials for the cluster. Both are common practice; this lesson models neither product.',
    },
  ],
};

export default lesson;
