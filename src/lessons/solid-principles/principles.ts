import type { PrincipleId } from './code';

export interface Principle {
  id: PrincipleId;
  name: string;
  /** The principle in its usual wording. */
  statement: string;
  /** Who it comes from. */
  source: string;
  /** The change request applied to both designs (L has a substitution run instead). */
  request: string;
  violating: string;
  fixed: string;
  /** When applying it is more ceremony than it is worth. */
  overkill: string;
}

export const PRINCIPLES: Record<PrincipleId, Principle> = {
  S: {
    id: 'S',
    name: 'Single responsibility',
    statement: 'A module should have one, and only one, reason to change.',
    source: 'Robert C. Martin; he later rephrased it as "responsible to one actor".',
    request: 'Change the PDF layout',
    violating: 'Report computes totals and lays out the PDF',
    fixed: 'Totals and PdfLayout are separate classes',
    overkill: 'A 20-line script that sums a CSV and prints it does not need two classes. Split when two different people or reasons keep changing the same class.',
  },
  O: {
    id: 'O',
    name: 'Open/closed',
    statement: 'Software entities should be open for extension, but closed for modification.',
    source: 'Bertrand Meyer (1988); the interface-based reading used here is Robert C. Martin\'s.',
    request: 'Add a CSV export',
    violating: 'one Exporter with a growing switch',
    fixed: 'an Exporter interface, one class per format',
    overkill: 'With two formats and no third in sight, a switch is clearer than an interface and a registry. Extract when the switch keeps growing.',
  },
  L: {
    id: 'L',
    name: 'Liskov substitution',
    statement: 'Code written for a base type must keep working when it is handed any subtype.',
    source: 'Barbara Liskov (1987), formalised with Jeannette Wing (1994) as behavioural subtyping.',
    request: 'Pass every subclass to the function written for its base type',
    violating: 'ReadOnlyFile extends File and makes write() throw',
    fixed: 'only WritableFile has write(); ReadOnlyFile is a plain File',
    overkill: 'Not every "is a" in English is a subtype in code. If a subclass has to disable a method, prefer a separate type or composition over inheritance.',
  },
  I: {
    id: 'I',
    name: 'Interface segregation',
    statement: 'Clients should not be forced to depend upon interfaces that they do not use.',
    source: 'Robert C. Martin.',
    request: 'Add duplex printing',
    violating: 'one fat Printer interface for every device',
    fixed: 'small Printing, Scanning, Faxing and Copying interfaces',
    overkill: 'One interface with one implementation and one caller gains nothing from being split. Split when different clients need different slices.',
  },
  D: {
    id: 'D',
    name: 'Dependency inversion',
    statement: 'High-level modules should not depend on low-level modules; both should depend on abstractions.',
    source: 'Robert C. Martin. Wiring the pieces together is the dependency-injection lesson.',
    request: 'Add a cache in front of the repository',
    violating: 'ReportService creates a MySqlRepo itself',
    fixed: 'ReportService asks for any ReportRepo',
    overkill: 'An interface with exactly one implementation that will never be swapped or faked in a test is extra indirection. Add it when a second implementation (or a test double) appears.',
  },
};

export const PRINCIPLE_IDS = Object.keys(PRINCIPLES) as PrincipleId[];
