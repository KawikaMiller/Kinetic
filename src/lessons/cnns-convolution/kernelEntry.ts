import { parseBoundedDecimal } from '../../core/parse';
import { KERNEL_LIMIT } from './convolve';

/** The refusal for one typed kernel entry: not a plain number, or outside -9..9. */
export const parseEntry = (text: string) =>
  parseBoundedDecimal(text, {
    min: -KERNEL_LIMIT,
    max: KERNEL_LIMIT,
    typographicMinus: true,
    messages: {
      invalid: (typed) => `"${typed}" isn't a plain number like 2 or -0.5.`,
      tooSmall: () => `Kernel entries run from -${KERNEL_LIMIT} to ${KERNEL_LIMIT}.`,
      tooBig: () => `Kernel entries run from -${KERNEL_LIMIT} to ${KERNEL_LIMIT}.`,
    },
  });
