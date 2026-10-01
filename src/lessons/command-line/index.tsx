import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A shell runs small programs and wires them together: | pipes one command\'s output into the next, > sends it to a file, && and || chain commands on success or failure, and nine permission bits decide who may read, write or run each file.',
    what: 'Every command gets three streams: input (stdin), normal output (stdout) and errors (stderr), and finishes with an exit code where 0 means success. The shell expands variables ($HOME) and globs (*.log) before running anything, connects stdout to the next command\'s stdin with |, points streams at files with > (overwrite), >> (append) and 2> (errors), and applies those redirections left to right. Each file has an owner, a group and permission bits: read, write and execute for the owner, the group and everyone else, written as letters (rwxr-xr--) or octal (754).',
    analogy: 'A pipeline is a kitchen line: one cook chops, the next fries, the next plates, each passing the tray along. stdout is the tray, stderr is the cook shouting at the manager, and the exit code is the thumbs-up or thumbs-down at the end of each station.',
    useCases: [
      'Answering questions about logs fast: which IPs caused the 500 errors?',
      'Build and deploy scripts that stop at the first failing step (&&)',
      'Capturing a command\'s output and errors in a file for later',
      'Fixing "Permission denied" on scripts and SSH keys with chmod',
    ],
    why: 'Servers, containers and CI pipelines are all driven from a shell, and most of their failures show up as an exit code, a missing redirect or a permission bit. Reading a pipeline stage by stage, and knowing why `2>&1 > file` still prints errors, turns cryptic one-liners into tools you can trust.',
    watch: 'Pipes: each command is a card. The output it produces (stdout) shows in blue and errors (stderr) in red; the number on each | is how many lines went down the pipe. The exit chip is green for 0 and red for anything else. Pipelines skipped by && or || turn into dashed, crossed-out cards. Files written by a redirection are tagged violet in the Files list. Permissions: the nine bits are yellow when set and dim when not, grouped user / group / other; the access table shows allowed in green and denied in red.',
  },
  tryThis: [
    'Press play on "Top IPs with 500s" and watch the line count shrink at each pipe.',
    'Click "+ wc -l" to bolt another command onto the end of the pipeline.',
    'Compare "> file 2>&1" with "2>&1 > file": the same two redirections in a different order.',
    'Load "&& stops on failure", then "|| runs on failure", and watch which card gets skipped.',
    'In File permissions, try chmod g+w, then the 600 preset for an SSH key.',
  ],
  keyIdeas: [
    'stdin, stdout and stderr are separate streams; | only carries stdout.',
    'Exit code 0 means success; && continues on 0, || on anything else, ; always.',
    'Redirections are applied left to right: > file 2>&1 sends both to the file, 2>&1 > file does not.',
    'rwx for user, group and other is nine bits; each octal digit is one group of three.',
  ],
  quiz: [
    {
      q: '`cmd 2>&1 > out.txt` and `cmd > out.txt 2>&1` do the same thing. True?',
      options: ['True, order doesn\'t matter', 'False: in the first, errors still go to the terminal', 'False: the first deletes out.txt', 'True, but the second is faster'],
      answer: 1,
      why: '2>&1 copies wherever stdout points right now. In the first, stdout still points at the terminal when 2>&1 runs, so errors go there; then stdout moves to the file.',
    },
    {
      q: 'grep finds no matching lines. What is its exit code?',
      options: ['0', '1', '2', '127'],
      answer: 1,
      why: 'grep exits 0 when something matched, 1 when nothing did, and 2 on an error such as a missing file. So `grep x f || echo none` prints "none".',
    },
    {
      q: 'What does `chmod 640 notes.txt` allow?',
      options: ['Everyone can read', 'Owner reads and writes, group reads, others nothing', 'Owner reads, group writes', 'Only the owner can execute'],
      answer: 1,
      why: '6 = 4+2 = rw- for the owner, 4 = r-- for the group, 0 = --- for everyone else.',
    },
    {
      q: 'Why does `cat a.log | sort | uniq -c` usually come with sort first?',
      options: ['uniq only collapses adjacent duplicates', 'uniq can\'t read from a pipe', 'sort makes it faster', 'It doesn\'t need it'],
      answer: 0,
      why: 'uniq compares each line with the one before it, so equal lines must be next to each other first.',
    },
  ],
};

export default lesson;
