/**
 * The hand-written report-generator code for every principle × design, before and after
 * its change request. Everything on screen (the code listing, the class diagram's edges,
 * which classes the change edits, which ones must be re-tested) is computed from these.
 */

export interface Member {
  name: string;
  /** Source lines, without the class's indentation. */
  lines: string[];
}

export type UnitKind = 'class' | 'interface' | 'function';

export interface Unit {
  name: string;
  kind: UnitKind;
  /** The declaration line without its opening brace: `class PdfExporter implements Exporter`. */
  head: string;
  /** A JSDoc line printed above the declaration. */
  doc?: string;
  members: Member[];
}

export type Variant = Unit[];

const cls = (head: string, members: Member[]): Unit => ({ name: head.split(' ')[1], kind: head.startsWith('interface') ? 'interface' : 'class', head, members });
const fn = (head: string, lines: string[], doc?: string): Unit => ({
  name: head.split(' ')[1].split('(')[0], kind: 'function', head, members: [{ name: 'body', lines }], ...(doc && { doc }),
});
const m = (name: string, ...lines: string[]): Member => ({ name, lines });

// ---- S: single responsibility ----

const TOTAL = m('total', 'total(rows: Row[]) {', '  return rows.reduce((s, r) => s + r.amount, 0);', '}');
const PDF_BEFORE = ['return pdf.page([title(rows), table(rows)]);'];
const PDF_AFTER = ['return pdf.page([logo(), title(rows), table(rows),', '  footer()]);'];

const sViolating = (pdfBody: string[]): Variant => [
  cls('class Report', [TOTAL, m('toPdf', 'toPdf(rows: Row[]) {', ...pdfBody.map((l) => `  ${l}`), '}')]),
  cls('class Dashboard', [m('show', 'show(rows: Row[]) {', '  return `Total: ${new Report().total(rows)}`;', '}')]),
  cls('class MonthlyJob', [m('run', 'run(rows: Row[]) {', '  return new Report().toPdf(rows);', '}')]),
];
const sFixed = (pdfBody: string[]): Variant => [
  cls('class Totals', [TOTAL]),
  cls('class PdfLayout', [m('render', 'render(rows: Row[]) {', ...pdfBody.map((l) => `  ${l}`), '}')]),
  cls('class Dashboard', [m('show', 'show(rows: Row[]) {', '  return `Total: ${new Totals().total(rows)}`;', '}')]),
  cls('class MonthlyJob', [m('run', 'run(rows: Row[]) {', '  return new PdfLayout().render(rows);', '}')]),
];

// ---- O: open/closed ----

const oViolating = (csv: boolean): Variant => [
  cls('class Exporter', [
    m(
      'export',
      'export(rows: Row[], format: string) {',
      '  switch (format) {',
      "    case 'pdf': return toPdf(rows);",
      "    case 'html': return toHtml(rows);",
      ...(csv ? ["    case 'csv': return toCsv(rows);"] : []),
      '  }',
      '}',
    ),
  ]),
  cls('class ReportJob', [m('run', 'run(rows: Row[], format: string) {', '  return new Exporter().export(rows, format);', '}')]),
  cls('class AdminPage', [m('preview', 'preview(rows: Row[]) {', "  return new Exporter().export(rows, 'html');", '}')]),
];
const exporter = (name: string, call: string) =>
  cls(`class ${name} implements Exporter`, [m('export', `export(rows: Row[]) { return ${call}(rows); }`)]);
const oFixed = (csv: boolean): Variant => [
  cls('interface Exporter', [m('export', 'export(rows: Row[]): string;')]),
  exporter('PdfExporter', 'toPdf'),
  exporter('HtmlExporter', 'toHtml'),
  ...(csv ? [exporter('CsvExporter', 'toCsv')] : []),
  cls('class ReportJob', [
    m('constructor', 'constructor(private out: Exporter) {}'),
    m('run', 'run(rows: Row[]) { return this.out.export(rows); }'),
  ]),
  cls('class AdminPage', [
    m('constructor', 'constructor(private out: Exporter) {}'),
    m('preview', 'preview(rows: Row[]) { return this.out.export(rows); }'),
  ]),
  fn('function exporterFor(format: string)', [
    'const all = {',
    '  pdf: new PdfExporter(),',
    '  html: new HtmlExporter(),',
    ...(csv ? ['  csv: new CsvExporter(),'] : []),
    '};',
    'return all[format];',
  ]),
];

// ---- I: interface segregation ----

const STUB = "{ throw new Error('not supported'); }";
const iViolating = (duplex: boolean): Variant => [
  cls('interface Printer', [
    m('print', 'print(doc: Doc): void;'),
    ...(duplex ? [m('printDuplex', 'printDuplex(doc: Doc): void;')] : []),
    m('scan', 'scan(): Image;'),
    m('fax', 'fax(to: string): void;'),
    m('staple', 'staple(doc: Doc): void;'),
    m('copy', 'copy(doc: Doc): void;'),
    m('emailScan', 'emailScan(to: string): void;'),
  ]),
  cls('class OfficePrinter implements Printer', [
    m('print', 'print(doc: Doc) { engine.print(doc); }'),
    ...(duplex ? [m('printDuplex', 'printDuplex(doc: Doc) { engine.duplex(doc); }')] : []),
    m('scan', 'scan() { return sensor.read(); }'),
    m('fax', 'fax(to: string) { modem.send(to, this.scan()); }'),
    m('staple', 'staple(doc: Doc) { arm.staple(doc); }'),
    m('copy', 'copy(doc: Doc) { this.print(this.scan()); }'),
    m('emailScan', 'emailScan(to: string) { mail(to, this.scan()); }'),
  ]),
  cls('class SimpleScanner implements Printer', [
    m('scan', 'scan() { return sensor.read(); }'),
    m('print', `print() ${STUB}`),
    ...(duplex ? [m('printDuplex', `printDuplex() ${STUB}`)] : []),
    m('fax', `fax() ${STUB}`),
    m('staple', `staple() ${STUB}`),
    m('copy', `copy() ${STUB}`),
    m('emailScan', `emailScan() ${STUB}`),
  ]),
  cls('class ScanApp', [m('constructor', 'constructor(private dev: Printer) {}'), m('run', 'run() { return this.dev.scan(); }')]),
  cls('class PrintApp', [m('constructor', 'constructor(private dev: Printer) {}'), m('run', 'run(doc: Doc) { this.dev.print(doc); }')]),
];
const iFixed = (duplex: boolean): Variant => [
  cls('interface Printing', [m('print', 'print(doc: Doc): void;'), ...(duplex ? [m('printDuplex', 'printDuplex(doc: Doc): void;')] : []), m('staple', 'staple(doc: Doc): void;')]),
  cls('interface Scanning', [m('scan', 'scan(): Image;'), m('emailScan', 'emailScan(to: string): void;')]),
  cls('interface Faxing', [m('fax', 'fax(to: string): void;')]),
  cls('interface Copying', [m('copy', 'copy(doc: Doc): void;')]),
  cls('class OfficePrinter implements Printing, Scanning, Faxing, Copying', [
    m('print', 'print(doc: Doc) { engine.print(doc); }'),
    ...(duplex ? [m('printDuplex', 'printDuplex(doc: Doc) { engine.duplex(doc); }')] : []),
    m('staple', 'staple(doc: Doc) { arm.staple(doc); }'),
    m('scan', 'scan() { return sensor.read(); }'),
    m('emailScan', 'emailScan(to: string) { mail(to, this.scan()); }'),
    m('fax', 'fax(to: string) { modem.send(to, this.scan()); }'),
    m('copy', 'copy(doc: Doc) { this.print(this.scan()); }'),
  ]),
  cls('class SimpleScanner implements Scanning', [
    m('scan', 'scan() { return sensor.read(); }'),
    m('emailScan', 'emailScan(to: string) { mail(to, this.scan()); }'),
  ]),
  cls('class ScanApp', [m('constructor', 'constructor(private dev: Scanning) {}'), m('run', 'run() { return this.dev.scan(); }')]),
  cls('class PrintApp', [m('constructor', 'constructor(private dev: Printing) {}'), m('run', 'run(doc: Doc) { this.dev.print(doc); }')]),
];

// ---- D: dependency inversion ----

const MYSQL_LOAD = m('load', 'load(month: string) {', "  return mysql.query(SALES_BY_MONTH, [month]);", '}');
const dViolating = (cache: boolean): Variant => [
  cls('class MySqlRepo', [MYSQL_LOAD]),
  ...(cache
    ? [
        cls('class CachedRepo', [
          m('hits', 'private hits: Record<string, Row[]> = {};'),
          m('constructor', 'constructor(private inner: MySqlRepo) {}'),
          m('load', 'load(month: string) {', '  return (this.hits[month] ??= this.inner.load(month));', '}'),
        ]),
      ]
    : []),
  cls('class ReportService', [
    m('repo', cache ? 'private repo = new CachedRepo(new MySqlRepo());' : 'private repo = new MySqlRepo();'),
    m('build', 'build(month: string) {', '  return summarise(this.repo.load(month));', '}'),
  ]),
  cls('class ReportJob', [m('run', 'run(month: string) {', '  return new ReportService().build(month);', '}')]),
];
const dFixed = (cache: boolean): Variant => [
  cls('interface ReportRepo', [m('load', 'load(month: string): Row[];')]),
  cls('class MySqlRepo implements ReportRepo', [MYSQL_LOAD]),
  ...(cache
    ? [
        cls('class CachedRepo implements ReportRepo', [
          m('hits', 'private hits: Record<string, Row[]> = {};'),
          m('constructor', 'constructor(private inner: ReportRepo) {}'),
          m('load', 'load(month: string) {', '  return (this.hits[month] ??= this.inner.load(month));', '}'),
        ]),
      ]
    : []),
  cls('class ReportService', [
    m('constructor', 'constructor(private repo: ReportRepo) {}'),
    m('build', 'build(month: string) {', '  return summarise(this.repo.load(month));', '}'),
  ]),
  cls('class ReportJob', [m('constructor', 'constructor(private svc: ReportService) {}'), m('run', 'run(month: string) { return this.svc.build(month); }')]),
  fn('function main()', [
    cache ? 'const repo = new CachedRepo(new MySqlRepo());' : 'const repo = new MySqlRepo();',
    'return new ReportJob(new ReportService(repo));',
  ]),
];

// ---- L: Liskov substitution, real JavaScript ----

/**
 * The L scene's code is plain JavaScript, so the lesson can run it for real (see run.ts).
 * JSDoc names the parameter types, which is also how the diagram finds `saveAll`'s edge.
 */
export const L_CODE: Record<'violating' | 'fixed', Variant> = {
  violating: [
    cls('class File', [
      m('constructor', 'constructor(name) { this.name = name; this.text = ""; }'),
      m('write', 'write(text) {', '  this.text += text;', '  return `${this.name}: wrote ${text.length} chars`;', '}'),
    ]),
    cls('class ReadOnlyFile extends File', [m('write', 'write() {', '  throw new TypeError(`${this.name} is read-only`);', '}')]),
    fn('function saveAll(files, text)', ['return files.map((f) => f.write(text));'], '/** @param {File[]} files */'),
  ],
  fixed: [
    cls('class File', [
      m('constructor', 'constructor(name) { this.name = name; this.text = ""; }'),
      m('read', 'read() { return this.text; }'),
    ]),
    cls('class WritableFile extends File', [
      m('write', 'write(text) {', '  this.text += text;', '  return `${this.name}: wrote ${text.length} chars`;', '}'),
    ]),
    cls('class ReadOnlyFile extends File', []),
    fn('function saveAll(files, text)', ['return files.map((f) => f.write(text));'], '/** @param {WritableFile[]} files */'),
    fn('function readAll(files)', ['return files.map((f) => `${f.name}: ${f.read().length} chars`);'], '/** @param {File[]} files */'),
  ],
};

export type PrincipleId = 'S' | 'O' | 'L' | 'I' | 'D';
export type Design = 'violating' | 'fixed';

/** Before and after the change request, per principle with one (L has a substitution run instead). */
export const VARIANTS: Record<Exclude<PrincipleId, 'L'>, Record<Design, { before: Variant; after: Variant }>> = {
  S: {
    violating: { before: sViolating(PDF_BEFORE), after: sViolating(PDF_AFTER) },
    fixed: { before: sFixed(PDF_BEFORE), after: sFixed(PDF_AFTER) },
  },
  O: {
    violating: { before: oViolating(false), after: oViolating(true) },
    fixed: { before: oFixed(false), after: oFixed(true) },
  },
  I: {
    violating: { before: iViolating(false), after: iViolating(true) },
    fixed: { before: iFixed(false), after: iFixed(true) },
  },
  D: {
    violating: { before: dViolating(false), after: dViolating(true) },
    fixed: { before: dFixed(false), after: dFixed(true) },
  },
};
