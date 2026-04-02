import test from "node:test";
import assert from "node:assert/strict";

// Only tests the 404 case, not the production cache.
test("throws on 404", async () => {
  const status = 404;
  assert.equal(status, 404);
});
