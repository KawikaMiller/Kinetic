# Wave 8 Phase 2 requests (for the wave 8→9 kit round)

## B23
- No new kit requests. Every piece fit as-is.
- **Flaky timeout under load:** `file-systems/frames.test.ts` "the try-this text names the 20 ms cut" failed once at the 15 s limit during a full `npm test` while other work was running (passes alone, 35/35). Make it cheaper.
- **Test-only Node dependency:** the B23 tests load `node:sqlite` by dynamic import with a local type. A typed `core/testing/sqlite.ts` helper would stop each lesson re-declaring it (compare `core/testing/node.ts`).

## B25
- **core/crypto:** `b64urlDecode` and a byte-level `timingSafeEqual`. Pagination has a local `decodeCursor`; webhooks compares with plain `===` and says so on screen.
- **scripts/shot.mjs:** wrap `--evalfile` in an async function (top-level `await` is a SyntaxError today). `--play` on a scene with no player prints "no play button" for every shot; make it a quiet no-op.
- **GanttLanes:** an optional per-bar ring colour and a separate "now" colour, so a current step can be marked without overriding the result ring.

## B24
- **Time-stepped frame builder** (3 users: http-versions, realtime-transports, graphql): `timeFrames({ end, steps, milestones: {t, say}[], intro, summary }) → {now, say?, hold?}[]` in core.
- **GanttLanes `labels={false}`:** lessons pass `labelMinPx={Infinity}` to hide bar labels on thin bars.
- **Roving toolbar hook:** `useRovingToolbar(count)` (http-caching has a local `useToolbar`; `useRadioGroup` is radio-semantic and doesn't fit a row of toggle chips).
- **Docs:** `plural(n, 'x')` already includes the number ("24 24 bytes" bit two B24 captions); add a one-line doc warning.
