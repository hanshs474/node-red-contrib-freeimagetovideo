import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { internals } = require("./fitv.js");
const { submit, waitFor, FitvError } = internals;

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const path = new URL(url).pathname;
    const r = routes[path];
    const [status, json] = typeof r === "function" ? r() : r;
    return { status, async json() { return json; } };
  };
  f.calls = calls;
  return f;
}

test("submit + waitFor polls to success", async () => {
  let n = 0;
  const fetch = fakeFetch({
    "/api/ai/generate": [200, { code: 0, message: "ok", data: { id: "t1" } }],
    "/api/ai/query": () =>
      ++n < 2
        ? [200, { code: 0, message: "ok", data: { id: "t1", status: "processing" } }]
        : [200, { code: 0, message: "ok", data: { id: "t1", status: "success", videos: ["https://cdn.freeimagetovideo.ai/v.mp4"] } }],
  });
  const id = await submit("a lantern", "minimax-h3", { image: "https://example.com/a.jpg" }, { duration: 6 }, "sk", fetch);
  assert.equal(id, "t1");
  assert.equal(fetch.calls[0].body.scene, "image-to-video");
  assert.deepEqual(fetch.calls[0].body.options.image_input, ["https://example.com/a.jpg"]);
  const url = await waitFor(id, "sk", 5000, fetch, 1);
  assert.equal(url, "https://cdn.freeimagetovideo.ai/v.mp4");
});

test("401 maps to auth", async () => {
  const fetch = fakeFetch({ "/api/ai/generate": [401, { code: -1, message: "Invalid API key" }] });
  await assert.rejects(submit("x", "minimax-h3", {}, {}, "sk", fetch), (e) => e instanceof FitvError && e.kind === "auth");
});
