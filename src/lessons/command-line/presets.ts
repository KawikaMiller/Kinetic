/** Command lines to load, each showing one idea. */
export const SHELL_PRESETS: readonly { id: string; label: string; line: string; caption: string }[] = [
  {
    id: 'top-ips',
    label: 'Top IPs with 500s',
    line: "cat access.log | grep 500 | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3",
    caption: 'Seven small tools, each doing one job: keep the 500 lines, take the first field, count each IP, show the top three.',
  },
  {
    id: 'and',
    label: '&& stops on failure',
    line: 'grep 500 nope.log && echo found some',
    caption: '&& runs the next command only if the last one succeeded (exit code 0). grep failed with exit 2, so echo never runs.',
  },
  {
    id: 'semicolon',
    label: '; always runs',
    line: 'grep 500 nope.log ; echo done anyway',
    caption: '; runs the next command no matter what happened before.',
  },
  {
    id: 'or',
    label: '|| runs on failure',
    line: 'grep 999 access.log || echo "no 999s today"',
    caption: '|| runs the next command only if the last one failed. grep exits 1 when nothing matches, which counts as failure.',
  },
  {
    id: 'redirect',
    label: '> and >>',
    line: 'grep 500 access.log > errors.txt ; grep 404 access.log >> errors.txt ; wc -l errors.txt',
    caption: '> writes a file (replacing it), >> appends to it. Nothing reaches the terminal until wc reads the file back.',
  },
  {
    id: 'stderr-file',
    label: '> file 2>&1',
    line: 'cat access.log nope.log > out.txt 2>&1',
    caption: 'Redirections apply left to right: stdout goes to out.txt, then stderr goes where stdout now points. Both end up in the file.',
  },
  {
    id: 'stderr-terminal',
    label: '2>&1 > file',
    line: 'cat access.log nope.log 2>&1 > out.txt',
    caption: 'Same pieces, other order: stderr copies stdout\'s target while it is still the terminal, then stdout moves to the file. The error still hits your screen.',
  },
  {
    id: 'vars',
    label: '$VAR and quotes',
    line: "echo \"Hi $USER, reading $LOG\" ; echo 'single quotes keep $USER literal' ; grep -c 500 $LOG",
    caption: 'Double quotes expand $VARIABLES, single quotes don\'t. $LOG expands to access.log before grep even starts.',
  },
  {
    id: 'glob',
    label: 'Globs *',
    line: 'ls ; wc -l *.txt',
    caption: 'The shell expands *.txt into every matching file name before wc runs; wc never sees the *.',
  },
];

/** Command blocks the learner can append to the pipeline. */
export const BLOCKS: readonly string[] = ['cat access.log', 'grep 500', 'grep -v 200', "cut -d' ' -f1", 'sort', 'uniq -c', 'sort -rn', 'head -3', 'wc -l'];
