import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'SIGTERM asks a process to shut down and can be handled; SIGKILL can\'t be caught at all. A graceful shutdown uses the time between them to stop taking traffic and finish what\'s in flight.',
    what: 'A signal is a small asynchronous notification the kernel delivers to a process. Most can be caught by a handler; without one, the default action runs, which for SIGTERM and SIGINT is to terminate. SIGKILL and SIGSTOP can never be caught, blocked or ignored. Orchestrators such as Kubernetes and Docker stop a container with SIGTERM, wait a grace period (30 s by default in Kubernetes), then send SIGKILL. A graceful handler marks the instance not ready, keeps serving until the load balancer stops sending, closes the listening socket, waits for in-flight requests, closes connections and exits 0, and does nothing extra if a second signal arrives. PID 1 is special: the kernel doesn\'t apply default actions to it for signals it hasn\'t set a handler for.',
    analogy: 'SIGTERM is the barista saying "we close in ten minutes": you finish your coffee and the door is locked behind the last customer. SIGKILL is the fire alarm: everyone out now, cups left on the tables.',
    useCases: [
      'Zero-downtime deploys: draining an instance before Kubernetes replaces it',
      'A container that takes exactly 30 s to stop: its PID 1 is ignoring SIGTERM',
      'Ctrl-C (SIGINT) and kill (SIGTERM) in the terminal, and kill -9 when nothing else works',
      'Zombie <defunct> processes piling up under a parent that never calls wait()',
    ],
    why: 'Every deploy, autoscale and node drain shuts processes down. Without a proper handler, each one drops in-flight requests and shows users errors; with a slow one, the deploy waits out the grace period and SIGKILL cuts the rest. It builds on `processes-threads` (PIDs, parents and children), `file-descriptors` (the listening socket you close) and `containers` (PID 1 in a container), and on `load-balancing` for removing an instance from rotation.',
    watch: 'Deploy shutdown: in the scene, the yellow pill is SIGTERM and the red one SIGKILL, travelling from the orchestrator to the server; the load balancer\'s link to the server turns violet and dashed when it removes the instance, and the server box turns red if it died from a signal or dim after a clean exit. On the timeline, blue bars are requests in flight, green ones finished after SIGTERM (during the drain, when there is one), grey ones finished before the deploy, red bars were cut by the kill and short red stubs got an error from the load balancer; dim dashed stubs went to another replica. Markers: yellow SIGTERM, violet "LB removes", the grace deadline in yellow turning red as SIGKILL, and a green "exit 0". The code panel highlights the handler line running now in yellow, earlier lines dimmed, and a line cut short by SIGKILL struck through; in the PID 1 Dockerfile the shell-form CMD is red. Children & zombies: blue boxes are running processes, a dashed dim box is a zombie, and the ps line for a zombie is dim. Signal table: "yes" in green can be caught, "no" in red can\'t.',
  },
  tryThis: [
    'Play Graceful, then switch Handler to No handler and compare the red bars.',
    'Pick Too slow, then drag Grace period up to 60 s and replay: the export finishes and the process exits 0.',
    'Pick PID 1 shell: SIGTERM arrives and nothing happens until the deadline. Read the fix in the last caption.',
    'With Graceful, drag Grace period down to 1 s: what happens to requests that arrive before the LB notices?',
    'In Children & zombies, compare Child exits, never reaped with SIGCHLD handler reaps.',
  ],
  keyIdeas: [
    'SIGTERM is a request a process can handle; SIGKILL and SIGSTOP can\'t be caught, so never rely on cleanup at SIGKILL.',
    'Graceful shutdown: fail readiness, wait for the LB, stop accepting, drain, close resources, exit 0 before the grace period ends.',
    'PID 1 ignores signals it has no handler for: use the exec form of CMD and handle SIGTERM, or run a tiny init like tini.',
    'Keep handlers minimal and idempotent: set a flag (in C, only async-signal-safe calls) and let the main loop shut down.',
  ],
  quiz: [
    {
      q: 'Kubernetes sends SIGTERM to your server. What happens if it has a handler?',
      options: [
        'Its handler runs, and it exits when it is ready',
        'The kernel kills it at once; handlers are ignored',
        'It is paused until the grace period has passed',
        'It is restarted in place with the same PID',
      ],
      answer: 0,
      why: 'SIGTERM is a polite request: with a handler installed the process keeps running and shuts down in its own time. Only if it is still alive when the grace period ends does Kubernetes send SIGKILL.',
    },
    {
      q: 'Can a process catch SIGKILL to flush its buffers before dying?',
      options: [
        'No: SIGKILL cannot be caught or ignored',
        'Yes: with a handler set by sigaction()',
        'Yes, but only when it runs as root',
        'Only if SIGTERM was blocked beforehand',
      ],
      answer: 0,
      why: 'SIGKILL (and SIGSTOP) are handled by the kernel itself and never reach the process. Cleanup has to happen on SIGTERM, before the grace period runs out.',
    },
    {
      q: 'A container started with CMD node server.js (shell form) always takes 30 s to stop. Why?',
      options: [
        'sh is PID 1 and never passes SIGTERM on',
        'Node needs 30 s to close its event loop',
        'Docker waits 30 s before sending any signal',
        'SIGTERM is queued until all files are closed',
      ],
      answer: 0,
      why: 'The shell form runs /bin/sh -c as PID 1. It doesn\'t forward SIGTERM, and PID 1 has no default action for it, so nothing happens until SIGKILL. Use the exec form (CMD ["node", "server.js"]) with a handler, or an init such as tini.',
    },
    {
      q: 'Why should a graceful handler wait a moment before closing the listening socket?',
      options: [
        'The LB can still send requests for a moment',
        'The socket must stay open for SIGKILL to work',
        'Closing it early stops in-flight requests too',
        'The kernel only allows closing it after 2 s',
      ],
      answer: 0,
      why: 'Removing an instance from a load balancer takes a moment. Requests sent in that window would hit a closed port and fail. Closing the listener doesn\'t affect connections already accepted.',
    },
    {
      q: 'ps shows a child as <defunct>. What does that mean?',
      options: [
        'It exited and its parent hasn\'t called wait()',
        'It is stuck in an infinite loop using the CPU',
        'It caught SIGKILL and is cleaning up slowly',
        'It was stopped by SIGSTOP and awaits SIGCONT',
      ],
      answer: 0,
      why: 'A zombie has already exited; the kernel only keeps its PID and exit status until the parent collects them with wait(). It uses no CPU. A SIGCHLD handler that calls waitpid() reaps it.',
    },
  ],
};

export default lesson;
