import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Liveness asks "should this container be killed and restarted?", readiness asks "should it get traffic right now?", and startup asks "has it finished starting?": mixing them up causes restart loops and restart storms.',
    what: 'Three probes run against each container. The startup probe holds the other two off until the app has finished starting, and kills the container if it never does. Liveness restarts the container after enough failures in a row, so it should only check whether the process itself is stuck. Readiness takes the pod out of the Service\'s endpoints after enough failures in a row, without restarting anything, so it is the place for "my dependencies are healthy and my cache is warm". A shallow check looks only at the process; a deep check also looks at dependencies, and deep checks on liveness turn one shared failure into every pod restarting at once.',
    analogy: 'A restaurant kitchen. Startup is "the stove is lit", readiness is "taking orders now" (the cook steps out when the fridge is empty, but stays employed), and liveness is a manager checking whether the cook has collapsed: only then do you call someone new in.',
    useCases: [
      'Giving a slow-loading app a startup probe so liveness stops killing it before it has finished booting',
      'Moving a database check from liveness to readiness so a DB outage drains traffic instead of restarting every pod',
      'Catching a deadlocked process that still accepts connections, with a check that exercises the request handler',
      'Tuning periods and failure thresholds so a short blip does not make pods flip in and out of rotation',
    ],
    why: 'Misconfigured probes are a classic cause of self-inflicted outages: the cluster turns a small problem into a restart storm, or leaves a hung pod in rotation. It builds on `kubernetes-basics` (pods, Services, endpoints) and `load-balancing` (health checks that pull a backend out of rotation); the graceful stop of a restarted container is covered in `signals-graceful-shutdown`.',
    watch: 'Each pod card has three lights, one per probe: green means its last run passed, red that it failed, dim that it has not run yet in this container (a hollow dim ring means there is no such probe). A blue-edged card is in rotation and a dashed orange card is restarting. The Database card shows whether the database is up (it turns red and reads unreachable while it is down), and its connection attempts pulse yellow each second something connects. On the timeline each pod has a row: blue bars are time in rotation, an orange tick is a restart (followed by a dim dashed wait), and below it each enabled probe has a row of green (passed) and red (failed) ticks, one per run. The vertical line is now.',
  },
  tryThis: [
    'Press play on Slow boot: liveness kills each pod before it finishes loading, again and again. Switch Startup probe to On and replay: nobody restarts, and pods are Ready at 30 s.',
    'Pick DB outage and play: with the DB check on liveness every pod restarts together while the DB is down. Set Liveness to Handler and Readiness to DB and replay: pods leave rotation and nobody restarts (compare the Restarts stat, 8 before and 0 now).',
    'Pick Deadlocked process and play: pod 3 stays Ready because TCP still works. Set both Liveness and Readiness to Handler and replay: it leaves rotation, then restarts once.',
    'Pick Ready too early and play: pods are Ready at 5 s but serve slow requests until the cache warms. Set Readiness to Cache and replay: no slow requests, but errors go up, not down. All four pods start at once, so for 20 s nothing is in rotation and those requests have nowhere to go. A real rollout keeps the old pods serving meanwhile.',
    'Pick Flapping and play: readiness on the DB with 1 failure flips every pod in and out at each blip. Raise failures to 3 and the rotation stays put, but the requests during each blip still fail, because the database really is down.',
  ],
  keyIdeas: [
    'Liveness answers "restart me?", so keep it shallow: check only the process itself, never shared dependencies.',
    'Readiness answers "send me traffic?": put dependency and warm-up checks there, because failing it removes the pod without restarting it.',
    'A startup probe holds liveness and readiness off while the app boots; its period times its threshold must exceed the boot time.',
    'A probe only acts after a threshold of failures in a row, so period times threshold is how long a problem lasts before anything happens.',
  ],
  quiz: [
    {
      q: 'The database goes down for a while. Where should the "DB reachable" check go, so pods are not restarted for something a restart cannot fix?',
      options: [
        'On readiness, so pods leave rotation without restarting',
        'On liveness, so the pods restart and reconnect to the database',
        'On startup, so the pods wait until it is back',
        'On both, so the failure is caught twice over',
      ],
      answer: 0,
      why: 'Restarting a healthy process does not bring the database back, and when every pod restarts at once they all reconnect together. A readiness failure drains the pod and leaves it running, ready to rejoin the moment the check passes.',
    },
    {
      q: 'What does a failing readiness probe do to a pod?',
      options: [
        'Removes it from the Service\'s endpoints and leaves it running',
        'Restarts its container once the threshold of failures is hit',
        'Deletes the pod so that its ReplicaSet creates a new one',
        'Pauses the other probes until the readiness probe passes',
      ],
      answer: 0,
      why: 'Readiness only controls whether the pod receives traffic. A pod that is not ready keeps running and keeps being probed, and one passing probe puts it back in rotation.',
    },
    {
      q: 'An app needs 30 s to load, and liveness runs every 5 s with a threshold of 3. With no startup probe, what happens?',
      options: [
        'Liveness fails while loading and restarts it, again and again',
        'Liveness only starts after the app has been up for 30 s',
        'Readiness covers it, so the pod just waits out of rotation',
        'The container is moved to another node that happens to load faster',
      ],
      answer: 0,
      why: 'Liveness starts as soon as the container does. Three failures in a row, about 10 s in, restart the container before it has finished loading, and the loop repeats. A startup probe holds liveness off until the app is up.',
    },
    {
      q: 'Liveness runs every 5 s and gives up after 3 failures in a row. About how long after a handler hangs is the container restarted?',
      options: ['10 to 15 seconds', 'Under 5 seconds', 'Exactly 3 seconds', '30 to 35 seconds'],
      answer: 0,
      why: 'The first failing probe comes within one period (up to 5 s) of the hang, and two more failures follow at 5 s intervals: 10 s after the first failure, so the restart comes 10 to 15 s after the hang.',
    },
    {
      q: 'A process deadlocks: its port still accepts connections but nothing is served. Which liveness check catches it?',
      options: [
        'An HTTP check that runs the request handler',
        'A TCP check on the service port',
        'A check of the container\'s CPU usage',
        'A ping from the node to the pod\'s IP address',
      ],
      answer: 0,
      why: 'A TCP check only proves that something is listening, which a deadlocked process still does. A check that calls the handler fails when the handler hangs.',
    },
  ],
};

export default lesson;
