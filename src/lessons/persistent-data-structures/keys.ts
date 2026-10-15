import { parseBoundedInt, type FieldParse } from '../../core/parse';

export const VALUE_MIN = -999;
export const VALUE_MAX = 999;
/** The drawn DAG holds v0 and eleven updates; the cost model has no such limit. */
export const VERSION_LIMIT = 12;

/** A cell index typed into a field: a whole number from 0 to n - 1, or the sentence that refuses it. */
export const parseIndex = (text: string, n: number): FieldParse<number> =>
  parseBoundedInt(text, {
    min: 0,
    max: n - 1,
    messages: {
      empty: 'Type a cell number.',
      invalid: (typed) => `"${typed}" is not a cell number. Use plain digits, like 3.`,
      tooSmall: () => `Cells are numbered from 0 to ${n - 1}.`,
      tooBig: () => `Cells are numbered from 0 to ${n - 1}.`,
    },
  });

/** A value typed into a field: a whole number from -999 to 999, or the sentence that refuses it. */
export const parseValue = (text: string): FieldParse<number> =>
  parseBoundedInt(text, {
    min: VALUE_MIN,
    max: VALUE_MAX,
    typographicMinus: true,
    messages: {
      empty: 'Type a whole number.',
      invalid: (typed) => `"${typed}" is not a whole number. Use plain digits, like 42.`,
      tooSmall: () => `Values go from ${VALUE_MIN} to ${VALUE_MAX}.`,
      tooBig: () => `Values go from ${VALUE_MIN} to ${VALUE_MAX}.`,
    },
  });

/** Why a new version cannot be made, or null. */
export const refuseVersion = (versions: number): string | null =>
  versions >= VERSION_LIMIT ? `The drawing holds ${VERSION_LIMIT} versions (v0 and ${VERSION_LIMIT - 1} updates). Reset to start again.` : null;
