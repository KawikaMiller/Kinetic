import { groupInt, type BoundedIntMessages } from '../../components/boundedIntParse';

/** This lesson's refusal wording for its cost fields. */
export const costFieldMessages: BoundedIntMessages = (label, min, max) => ({
  empty: `Type a whole number for ${label}.`,
  invalid: (typed) => `"${typed}" isn't a whole number.`,
  tooSmall: () => `${label} has to be at least ${groupInt(min)}.`,
  tooBig: () => `${label} goes up to ${groupInt(max)} here.`,
});
