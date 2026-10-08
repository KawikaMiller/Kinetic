import ts from 'typescript';

/**
 * Test-only: type-check in-memory TypeScript files with the real compiler (`tsc --strict`),
 * so the lesson's TypeScript verdicts are pinned against tsc rather than a hand-typed copy.
 * Never imported by app code (it pulls in the whole compiler).
 */
export interface TscError {
  file: string;
  /** 0-based line of the error. */
  line: number;
  code: number;
  /** The first line of the message, as tsc prints it after "error TSxxxx: ". */
  message: string;
}

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  types: [],
  skipLibCheck: true,
};

export function tscErrors(files: Record<string, string>): TscError[] {
  const host = ts.createCompilerHost(OPTIONS);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (f) => f in files || fileExists(f);
  host.readFile = (f) => files[f] ?? readFile(f);
  host.getSourceFile = (f, lang, onError, create) =>
    f in files ? ts.createSourceFile(f, files[f], lang) : getSourceFile(f, lang, onError, create);
  const program = ts.createProgram(Object.keys(files), OPTIONS, host);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const pos = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : { line: -1 };
    return {
      file: d.file?.fileName ?? '',
      line: pos.line,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n').split('\n')[0],
    };
  });
}

/** What TypeScript emits for a snippet: the types are gone. */
export const emitJs = (src: string) =>
  ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
