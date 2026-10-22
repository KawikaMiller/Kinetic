// Phone-only layout checks shared by `smoke --mobile` and `sweep`: content cut off by the stage frame, and
// unreadably small scene text.

/** Smallest scene text a phone should render: the smallest size lessons use on desktop. */
export const MIN_SCENE_TEXT_PX = 8;

/** Content cut off by the stage frame, and the smallest scene (SVG) text with its rendered size. */
export function checkPhone(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('.stage-frame');
    if (!frame) return { clipped: [], smallText: null };
    const right = frame.getBoundingClientRect().right + 1;
    const clipped = [];
    // A WideRegion that sticks out of its own parent (a centred flex column centres min-width content and
    // overflows both sides) sits outside its scroller's reach; an ancestor's overflow:hidden then hides it
    // from the check below, so look at the shell against its parent directly.
    for (const shell of frame.querySelectorAll('.stage-shell')) {
      const box = shell.getBoundingClientRect();
      const parent = shell.parentElement.getBoundingClientRect();
      if (box.width && (box.left < parent.left - 1 || box.right > parent.right + 1)) clipped.push('stage-shell (sticks out of its parent)');
    }
    for (const el of frame.querySelectorAll('*')) {
      if (el.closest('.stage-wide')) continue; // scrolls sideways on purpose
      const box = el.getBoundingClientRect();
      if (!box.width || box.right <= right || el.parentElement.getBoundingClientRect().right > right) continue;
      // clipped on purpose by its own overflow container, which itself fits
      let a = el.parentElement;
      let deliberate = false;
      for (; a && a !== frame; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= right) {
          deliberate = true;
          break;
        }
      }
      if (!deliberate) clipped.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`);
    }
    let smallText = null;
    for (const text of frame.querySelectorAll('.stage svg text')) {
      // The drawing's own scale (viewBox → screen), not per-element animation transforms
      // like a packet scaling in, which would make the check depend on timing.
      const ctm = text.ownerSVGElement?.getScreenCTM();
      if (!ctm || !text.textContent.trim() || !text.getBoundingClientRect().width) continue;
      const px = parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b);
      if (!smallText || px < smallText.px) smallText = { px: Math.round(px * 10) / 10, text: text.textContent.trim().slice(0, 24) };
    }
    return { clipped: clipped.slice(0, 3), smallText };
  });
}
