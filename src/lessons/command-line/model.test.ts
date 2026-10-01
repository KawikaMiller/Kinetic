import { describe, expect, it } from 'vitest';
import { runCommand } from './commands';
import { ACCESS_LOG, ENV, INITIAL_FS } from './fixture';
import { ACTIONS, CLASSES, bitsFromMode, can, chmod, lsString, modeFromBits, octal, symbolic } from './permissions';
import { SHELL_PRESETS } from './presets';
import { glob, parse, runShell, showArgv, tokenize } from './shell';

const run = (line: string, fs = INITIAL_FS) => runShell(line, fs, ENV);
const out = (line: string) => run(line).terminal.map((t) => t.text);

describe('the pipeline equals the same steps done directly in JavaScript', () => {
  it('top IPs with 500s', () => {
    const preset = SHELL_PRESETS.find((p) => p.id === 'top-ips')!;
    const counts = new Map<string, number>();
    for (const l of ACCESS_LOG.split('\n').filter((l) => l.includes('500'))) {
      const ip = l.split(' ')[0];
      counts.set(ip, (counts.get(ip) ?? 0) + 1);
    }
    expect(counts).toEqual(new Map([['198.51.100.4', 3], ['203.0.113.7', 1], ['192.0.2.33', 1]]));
    expect(out(preset.line)).toEqual(['      3 198.51.100.4', '      1 203.0.113.7', '      1 192.0.2.33']);
    const stages = run(preset.line).runs[0].stages;
    expect(stages.map((s) => s.stdout.length)).toEqual([12, 5, 5, 5, 3, 3, 3]);
    expect(stages.map((s) => s.exit)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('commands match GNU behaviour on the lesson\'s cases', () => {
  const fs = INITIAL_FS;
  it('grep exits 0 on a match, 1 on none, 2 on an error', () => {
    expect(runCommand(['grep', '404', 'access.log'], [], fs)).toMatchObject({ exit: 0 });
    expect(runCommand(['grep', '999', 'access.log'], [], fs)).toMatchObject({ exit: 1, stdout: [] });
    expect(runCommand(['grep', '500', 'nope.log'], [], fs)).toMatchObject({ exit: 2, stderr: ['grep: nope.log: No such file or directory'] });
    expect(runCommand(['grep', '-c', '500', 'access.log'], [], fs).stdout).toEqual(['5']);
    expect(runCommand(['grep', '-v', '200', 'access.log'], [], fs).stdout).toHaveLength(8);
  });

  it('uniq only collapses adjacent lines; sort -rn falls back to the whole line', () => {
    expect(runCommand(['uniq', '-c'], ['a', 'a', 'b', 'a'], fs).stdout).toEqual(['      2 a', '      1 b', '      1 a']);
    expect(runCommand(['sort', '-rn'], ['  1 b', ' 10 a', '  2 c', '  1 a'], fs).stdout).toEqual([' 10 a', '  2 c', '  1 b', '  1 a']);
    expect(runCommand(['sort'], ['b', 'B', 'a'], fs).stdout).toEqual(['B', 'a', 'b']); // byte order, like LC_ALL=C
  });

  it('cut, head, wc and errors', () => {
    expect(runCommand(['cut', '-d', ' ', '-f1'], ['a b c', 'nodelim'], fs).stdout).toEqual(['a', 'nodelim']);
    expect(runCommand(['cut', '-d,', '-f3,1'], ['a,b,c'], fs).stdout).toEqual(['a,c']);
    expect(runCommand(['head', '-3'], ['1', '2', '3', '4'], fs).stdout).toEqual(['1', '2', '3']);
    expect(runCommand(['wc', '-l', 'access.log'], [], fs).stdout).toEqual(['12 access.log']);
    expect(runCommand(['nosuch'], [], fs)).toMatchObject({ exit: 127, stderr: ['bash: nosuch: command not found'] });
  });
});

describe('parsing: quotes, variables and globs', () => {
  it('handles quotes, adjacent quoting and escapes', () => {
    expect(parse("cut -d' ' -f1", ENV, INITIAL_FS)[0].commands[0].argv).toEqual(['cut', '-d ', '-f1']);
    expect(parse('echo "a  b" c\\ d', ENV, INITIAL_FS)[0].commands[0].argv).toEqual(['echo', 'a  b', 'c d']);
  });

  it('expands $VAR in double quotes and bare words, never in single quotes', () => {
    expect(out(`echo "Hi $USER" '$USER' \${HOME}/x $NOPE.`)).toEqual(['Hi ada $USER /home/ada/x .']);
  });

  it('expands globs against the files, sorted, and leaves unmatched globs as typed', () => {
    expect(glob('*.txt', INITIAL_FS)).toEqual(['notes.txt']);
    expect(glob('*.log', { ...INITIAL_FS, 'a.log': '' })).toEqual(['a.log', 'access.log']);
    expect(glob('*.csv', INITIAL_FS)).toEqual(['*.csv']);
  });

  it('reports syntax errors instead of throwing', () => {
    expect(run("echo 'oops").error).toMatch(/missing closing '/);
    expect(run('| sort').error).toMatch(/command is missing/);
    expect(run('echo hi >').error).toMatch(/needs a file name/);
  });
});

describe('lists, exit codes and redirections', () => {
  it('&& skips after a failure, ; always runs, || runs only after a failure', () => {
    const and = run('grep 500 nope.log && echo found');
    expect(and.runs.map((r) => [r.ran, r.exit])).toEqual([[true, 2], [false, null]]);
    expect(run('grep 500 nope.log ; echo done').runs.map((r) => r.ran)).toEqual([true, true]);
    expect(out('grep 999 access.log || echo "no 999s"')).toEqual(['no 999s']);
    expect(run('true || echo never').runs[1].ran).toBe(false);
  });

  it('> replaces, >> appends', () => {
    const r = run('grep 500 access.log > e.txt ; grep 404 access.log >> e.txt ; wc -l e.txt');
    expect(r.fs['e.txt'].split('\n')).toHaveLength(7);
    expect(r.terminal.map((t) => t.text)).toEqual(['7 e.txt']);
    const again = runShell('echo new > e.txt', r.fs, ENV);
    expect(again.fs['e.txt']).toBe('new');
  });

  it('applies redirections left to right: > f 2>&1 vs 2>&1 > f', () => {
    const both = run('cat access.log nope.log > out.txt 2>&1');
    expect(both.terminal).toEqual([]);
    expect(both.fs['out.txt'].split('\n').at(-1)).toBe('cat: nope.log: No such file or directory');
    expect(both.runs[0].stages[0]).toMatchObject({ stdoutTo: 'out.txt', stderrTo: 'out.txt' });

    const split = run('cat access.log nope.log 2>&1 > out.txt');
    expect(split.terminal).toEqual([{ text: 'cat: nope.log: No such file or directory', stream: 'err' }]);
    expect(split.fs['out.txt'].split('\n')).toHaveLength(12);
    expect(split.runs[0].stages[0]).toMatchObject({ stdoutTo: 'out.txt', stderrTo: 'terminal' });
  });

  it('2>&1 into a pipe sends errors down the pipe too', () => {
    expect(out('cat nope.log 2>&1 | wc -l')).toEqual(['1']);
    expect(out('cat nope.log | wc -l')).toEqual(['cat: nope.log: No such file or directory', '0']);
  });

  it('every preset runs without a syntax error and leaves the starting files alone', () => {
    for (const p of SHELL_PRESETS) {
      const r = run(p.line);
      expect(r.error).toBeNull();
      expect(INITIAL_FS['access.log']).toBe(ACCESS_LOG);
    }
  });
});

describe('permissions: octal, symbolic and ls -l agree, for all 512 modes', () => {
  it('round-trips every mode through bits, octal, symbolic and chmod', () => {
    for (let mode = 0; mode < 512; mode++) {
      expect(modeFromBits(bitsFromMode(mode))).toBe(mode);
      expect(parseInt(octal(mode), 8)).toBe(mode);
      expect(chmod(octal(mode), 0o777 - mode)).toBe(mode);
      expect(chmod(symbolic(mode), 0o777 - mode)).toBe(mode);
      const ls = lsString(mode);
      expect(ls).toHaveLength(10);
      CLASSES.forEach((who, k) =>
        ACTIONS.forEach((action, j) => expect(can(mode, who, action)).toBe(ls[1 + k * 3 + j] !== '-')));
    }
  });

  it('spells the classic modes', () => {
    expect([octal(0o754), symbolic(0o754), lsString(0o754)]).toEqual(['754', 'u=rwx,g=rx,o=r', '-rwxr-xr--']);
    expect(lsString(0o600)).toBe('-rw-------');
  });

  it('applies symbolic changes relative to the current mode', () => {
    expect(chmod('u+x', 0o644)).toBe(0o744);
    expect(chmod('go-w', 0o777)).toBe(0o755);
    expect(chmod('a=r', 0o755)).toBe(0o444);
    expect(chmod('+x', 0o644)).toBe(0o755);
    expect(chmod('u=rwx,g=rx,o=', 0)).toBe(0o750);
    expect(chmod('z+q', 0o644)).toBeNull();
  });
});

describe('showArgv', () => {
  it('quotes arguments so the line could be typed back', () => {
    expect(showArgv(['cut', '-d', ' ', '-f1'])).toBe("cut -d ' ' -f1");
    expect(showArgv(['echo', "it's", '$USER'])).toBe("echo 'it'\\''s' '$USER'");
    expect(tokenize(showArgv(['echo', "it's", '$USER', '']), ENV, INITIAL_FS).map((t) => t.value)).toEqual(['echo', "it's", '$USER', '']);
  });
});
