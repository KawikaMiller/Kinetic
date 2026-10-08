import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A phone app does not stay as you left it: the OS can end its process whenever it needs the memory, usually with no warning, so anything the user would miss must be written down on the way out.',
    what: 'A mobile app moves through lifecycle states and the platform calls your code on each change: an Android activity goes through created, started, resumed, paused, stopped and destroyed, and an iOS app through not running, inactive, active, background and suspended. Leaving the screen does not freeze the app for good. A stopped or suspended process can be killed to free memory without running any more of your code, and rotating the screen rebuilds an Android activity from scratch. State survives only if the app saved it when it left. Phones add limits a server never has: the network comes and goes, background time is capped, and every wake-up costs battery.',
    analogy: 'A hotel room you check out of without packing. Nothing happens to your things as long as the hotel has spare rooms, but when it needs the room it clears it without calling you. Only what you put in the safe on your way out is still there when you return.',
    useCases: [
      'Keeping a half-written message, a form or a scroll position when the user takes a call or switches apps',
      'Saving state in the right callback instead of one that a kill never reaches',
      'Handling rotation, which rebuilds an Android activity but not an iOS one',
      'Choosing push over polling and finishing or checkpointing work inside a short background budget',
    ],
    why: 'The classic mobile bug is "it works when I test it and loses data for real users": the tester never ran out of memory. Knowing which transitions can end your process, and which callback you can count on, tells you where to save and what to restore. It also explains battery complaints and half-done background work. Offline sync and conflict handling are a separate problem, covered in a later tier. See `processes-threads` for what a process is, `signals-graceful-shutdown` for shutdown signals on servers, and `browser-storage` for the web\'s version of keeping state.',
    watch: 'The phone on the left is the app; the diagram on the right is the platform\'s real lifecycle. The current state is solid yellow, states the last event passed through are a blue tint with blue arrows, and a killed process is solid red with a red arrow. A lost draft appears struck through in red, and a draft that came back is a green line in the log. In the log, red rows are kills or lost drafts and green rows are restored drafts. In Phone constraints, grey network bars mean offline, green is finished or the cheap side, and red is cut off or the costly side.',
  },
  tryThis: [
    'With nothing saved, type a draft, press Home, then Low memory, then Return to the app. What came back, and which callback ran at the moment of the kill?',
    'Press Reset, switch The app saves to Save state when leaving, type a draft and repeat the same three events. Then try Persist every keystroke and compare the Saves meter.',
    'Type a draft with nothing saved and press Rotate the screen on Android, then on iOS. Which platform lost the draft, and which instance number changed?',
    'Switch to iOS and press Home, Time passes, then Low memory. Which callbacks ran at each step, and why can a suspended app not be told anything?',
    'In Phone constraints, run the 45 s task without and then with Save progress as it goes. Then drag Poll every to 1 min and compare it with push.',
  ],
  keyIdeas: [
    'A stopped or suspended app can be killed with no callback: do not wait for a warning, because it may never come.',
    'Write down what the user would miss in the callback made when the app leaves the screen (`onSaveInstanceState` on Android, which since Android 9 runs after `onStop`; `sceneDidEnterBackground` on iOS), and read it back on the next start. `onSaveInstanceState` is for small UI state: write real user data to storage in `onPause` or `onStop`.',
    'Rotation rebuilds an Android activity and drops everything in memory, while iOS resizes the same views.',
    'A phone has a flaky network, a short background budget and a battery: do less work, checkpoint long tasks and prefer push to polling.',
  ],
  quiz: [
    {
      q: 'An app is in the background and the OS kills its process to free memory. Which callback is the app guaranteed to get first?',
      options: [
        'None: a killed process may get no callback at all',
        'onDestroy, which always runs just before a kill',
        'A final warning with a few seconds to spare to save',
        'The same callback that ran when the app left the screen',
      ],
      answer: 0,
      why: 'The system can end a stopped or suspended process without running any more of its code, so no callback is guaranteed. That is why saving belongs in the callback made when the app leaves the screen, while it still runs.',
    },
    {
      q: 'Where is the safest place to save a half-typed draft so that it survives a kill?',
      options: [
        'When the app leaves the screen, in the callback made then',
        'In the callback made at the moment the process is killed',
        'In the callback made when the app comes back to the front',
        'In a timer that keeps running while the app is stopped',
      ],
      answer: 0,
      why: 'Leaving the screen is the last point the app is sure to run. A kill gives no callback, and the return callback comes too late to save anything. A stopped app cannot rely on its own timers.',
    },
    {
      q: 'The screen is rotated while a draft sits in a plain variable in the app. What happens on each platform?',
      options: [
        'Android rebuilds the activity and loses it; iOS keeps it',
        'Both platforms rebuild the app and lose it',
        'Neither rebuilds anything, so both keep the variable',
        'iOS rebuilds the scene and loses it; Android keeps it',
      ],
      answer: 0,
      why: 'By default an Android configuration change such as rotation destroys and recreates the activity, so what was only in memory is gone unless it was saved. iOS resizes the existing views and the app is not recreated.',
    },
    {
      q: 'Why does push usually cost less battery than polling every few minutes?',
      options: [
        'The app wakes when a message arrives, not on a timer',
        'Push messages are smaller, so the radio draws less power',
        'The server does the polling, so the phone never uses its radio',
        'The OS blocks polling whenever the screen is turned off',
      ],
      answer: 0,
      why: 'Each wake-up powers up the radio and costs battery whether or not there is news. Polling wakes the app on a schedule, mostly for nothing; push wakes it once per message that actually arrives.',
    },
  ],
};

export default lesson;
