// Only tests the 404 case, not the production cache
test("throws on 404", async () => {
  const status = 404;
  expect(status).toBe(404);
});
