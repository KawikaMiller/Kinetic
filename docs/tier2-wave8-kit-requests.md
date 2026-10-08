# Wave 8 Phase 2 requests (for the wave 8→9 kit round)

## B23
- No new kit requests. Every piece fit as-is.
- **Flaky timeout under load:** `file-systems/frames.test.ts` "the try-this text names the 20 ms cut" failed once at the 15 s limit during a full `npm test` while other work was running (passes alone, 35/35). Make it cheaper.
- **Test-only Node dependency:** the B23 tests load `node:sqlite` by dynamic import with a local type. A typed `core/testing/sqlite.ts` helper would stop each lesson re-declaring it (compare `core/testing/node.ts`).
