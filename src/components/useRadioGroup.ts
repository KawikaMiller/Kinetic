import { useRef, type KeyboardEvent } from 'react';
import { radioKeyTarget, rovingTabStop } from '../core/radio';

/**
 * Keyboard behaviour for a row of role="radio" buttons (Segmented, the player's speed
 * buttons): one tab stop, arrows/Home/End move the selection and focus with it.
 *
 *   const radio = useRadioGroup(options.length, checkedIndex, (i) => onChange(options[i].value));
 *   options.map((o, i) => <button {...radio.itemProps(i)} …>)
 */
export function useRadioGroup(count: number, checkedIndex: number, select: (index: number) => void) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = rovingTabStop(checkedIndex);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = radioKeyTarget(e.key, index, count);
    if (target === null) return;
    e.preventDefault();
    select(target);
    items.current[target]?.focus();
  };

  return {
    itemProps: (index: number) => ({
      role: 'radio' as const,
      'aria-checked': index === checkedIndex,
      tabIndex: index === tabStop ? 0 : -1,
      ref: (el: HTMLButtonElement | null) => {
        items.current[index] = el;
      },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKeyDown(e, index),
    }),
  };
}
