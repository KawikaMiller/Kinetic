import { plural } from '../../core/format';
import type { LessonModule } from '../../core/types';
import { CALENDAR_START, DAYS, HORIZON_HOURS, MAX_RETRIES, runPipeline } from './engine';
import { hourLabel } from './chart';
import { baseConfig, failureFacts, loadFacts, scheduleFacts, shapeFacts } from './facts';
import { Stage } from './Stage';

const fail = failureFacts();
const load = loadFacts();
const shape = shapeFacts();
const sched = scheduleFacts();
const BACK_DAYS = 4;
const week = runPipeline(baseConfig, 0);
const backHour = HORIZON_HOURS - 24 * BACK_DAYS;
const loadedBack = week.history[backHour].loads.filter((n) => n > 0).length;

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'An orchestrator runs a graph of tasks on a schedule: a task starts when its upstream tasks succeed, a failure blocks what depends on it, and a rerun is only safe when the load is idempotent. A daily run for a date happens after that date has ended.',
    what: 'A five-task pipeline runs once a day on a calendar. The learner injects failures, sets retries and clears a failed task; reruns and backfills are tried against append loads and overwrite-by-date loads; ETL and ELT are compared as pipelines by what must run again when a cleaning rule changes; and the schedule is studied by its logical date, when its run is created, and what a pause and catch-up do.',
    analogy: 'A factory line for a daily newspaper. Each stage waits for the one before; if printing jams, the delivery stage never starts. Re-printing yesterday\'s edition is harmless if it replaces yesterday\'s copies, and a mess if it stacks a second copy on top. And Monday\'s edition is made after Monday is over.',
    useCases: [
      'Scheduling nightly extracts, transformations and report loads with dependencies between them',
      'Deciding how many retries a flaky step gets and when a person should be paged instead',
      'Making a load safe to rerun or backfill by writing a date partition instead of appending',
      'Reading why the run for a date appears after that date, and what a paused schedule does when it resumes',
    ],
    why: 'Pipelines fail halfway all the time, and the fix is to run them again. Whether that repairs the data or doubles it depends on the load, and whether a backfill or a catch-up does what you expect depends on how the scheduler names and triggers a run.',
    watch:
      'Each lane is a task and each bar an attempt, numbered by day: a green bar succeeded, a red one failed, a yellow one is running now, a dashed blue gap is a retry waiting, and an orange hatched bar is a task that did not run because an upstream task failed. In the load tables a green number equals the source, red is duplicated rows, violet is a late correction not loaded yet and dim means not loaded. In the schedule scene blue is a data interval, a green diamond a run created on time and a violet diamond a run created late by catch-up. Chips say what is simulated, scripted, a toy or from memory.',
  },
  tryThis: [
    `In "A DAG on a calendar" the whole week is drawn: ${DAYS} of ${DAYS} days have loaded. Press Back a day ${BACK_DAYS} times: the cursor is at ${hourLabel(CALENDAR_START, backHour)} UTC and ${loadedBack} of ${DAYS} have.`,
    `In "Failure and retry" day ${fail.day} and clean are selected. Press Fail this task: join and load_report do not run (${fail.blocked.map((s) => s.replace('_', ' ')).join(' and ')}) and the report holds ${fail.stuckRows} rows for ${fail.date}. Set Retries to ${MAX_RETRIES}: it still fails after ${plural(fail.retriedAttempts, 'attempt')}. Press Clear and rerun it: the report then holds ${fail.clearedRows} rows, the ${fail.source} in the source.`,
    `In "Idempotent loads" the load appends and seed ${load.seed}'s ${plural(load.ops.length, 'operation')} leave ${load.appendRows} rows for ${load.sourceRows} in the source, ${plural(load.appendDuplicated, 'date')} duplicated. Switch Load to overwrite: ${load.overwriteDuplicated} duplicated, and the report holds ${load.overwriteRows}.`,
    `In "ETL vs ELT as a pipeline" press Change the cleaning rule: ETL runs ${shape.etl.steps.length} steps again and reads the source ${shape.etl.extractRuns} times. Switch Pipeline to ELT: ${shape.elt.steps.length} steps and ${shape.elt.extractRuns} source reads.`,
    `In "Schedule semantics" the cursor is at ${sched.openLabel} and there is no run for logical date ${sched.date} yet: its interval closes ${sched.closesLabel}, when the run is created. Turn the Pipeline to Paused: with catch-up off, ${plural(sched.offRuns, 'run')} is created when it resumes for ${plural(sched.missedDays, 'missed day')}; turn Catch-up on and it is ${sched.onRuns}.`,
  ],
  keyIdeas: [
    'A task starts when every task it depends on has succeeded, and a failed task blocks the tasks after it; in this model they are marked upstream failed and do not run until the failure is cleared.',
    'A load is idempotent when running it twice leaves the same result: in this model overwriting a date\'s partition is, and appending is not, so a rerun or a backfill doubles appended rows.',
    'In this model late-arriving rows reach the report when that date is rerun, so a safe rerun is also how a correction is applied.',
    'In common schedulers the run for a logical date happens after its interval has closed, and a paused schedule either creates a run for each missed day or skips to the latest, depending on catch-up.',
  ],
  quiz: [
    {
      q: 'The clean task of one day fails for good, after all its retries. What happens to join and load_report of that day?',
      options: [
        'They do not run: they are marked upstream failed until the failure is cleared and the chain is run again',
        'They run on whatever data is already there, since a task is allowed to start without its upstream task finished',
        'They run once the next day\'s run succeeds, because the scheduler borrows the missing data from that run',
        'They are retried on their own the same number of times, which can succeed without clean having worked',
      ],
      answer: 0,
      why: 'A task starts when the tasks it depends on have succeeded. A failed upstream marks the downstream tasks as not run, so the report is not written from a half-finished chain.',
    },
    {
      q: 'Why is rerunning a day safe with an overwrite-by-date load and unsafe with an append load?',
      options: [
        "Overwrite replaces that date's rows, so reruns leave the same table; append adds the rows again",
        'Overwrite is faster, so there is less time for a second run to start before the first has finished running',
        'Append refuses a second run of the same date, and so the rerun silently does nothing at all to the table',
        'Overwrite keeps a copy of each earlier run, so a rerun can always be undone by choosing the older copy again',
      ],
      answer: 0,
      why: 'An idempotent load gives the same result however often it runs. Overwriting a date\'s partition does; appending duplicates the rows, as the report counts show.',
    },
    {
      q: 'A daily schedule has a run for logical date 2026-03-01. When is that run created?',
      options: [
        'Shortly after midnight on 2026-03-02, once the interval it covers has closed',
        'At the start of 2026-03-01, since a run belongs to the day it is named after and begins with it',
        'At the end of 2026-03-02, after a full extra day so that every late row has had time to arrive first',
        'Whenever someone presses the trigger, because the logical date only labels the data and does not schedule',
      ],
      answer: 0,
      why: 'In common schedulers a logical date names the interval of data and the run happens once that interval is over. Check your scheduler\'s documentation, as the semantics are a convention.',
    },
    {
      q: 'A pipeline is paused for four days and then resumed with catch-up off. How many runs does it create for the missed days?',
      options: [
        'One, for the latest missed day, and the earlier days are skipped',
        'Four, one for each missed day, created together at the moment it resumes',
        'None, because a run that was missed cannot be created again after the pause has ended',
        'Four, one a day over the next four days, so the backlog is cleared at the normal pace',
      ],
      answer: 0,
      why: 'Catch-up decides whether the missed intervals each get a run. With it off the scheduler skips to the latest, so earlier dates have no run unless someone backfills them.',
    },
    {
      q: 'The cleaning rule changes. Why does the ELT pipeline re-run fewer steps than the ETL one?',
      options: [
        "Raw and intermediate tables stay in the warehouse, so only cleaning and what follows run again",
        'ELT never cleans data, so there is no cleaning step in the pipeline that could have to run again at all',
        'ELT reads the source faster, so it can afford to repeat the extracts without anyone noticing them',
        'The warehouse applies the new rule to the old results by itself, with no step needing to run again',
      ],
      answer: 0,
      why: 'ETL kept nothing between steps, so the inputs of a re-run step are made again, including reading the source. ELT keeps raw and intermediate tables, so it re-runs the changed step and its descendants.',
    },
  ],
};

export default lesson;
