// Free Image to Video node: msg.payload (prompt) in, msg.payload (video URL with sound) out.
const BASE_URL = "https://freeimagetovideo.ai";
const KEYS_URL = `${BASE_URL}/settings/apikeys`;
const DEFAULT_MODEL = "minimax-h3";

class FitvError extends Error {
  constructor(message, kind = "other", status, code, reason) {
    super(message);
    this.name = "FitvError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

function errorFor(status, body) {
  const msg = String((body && body.message) || `HTTP ${status}`);
  const code = body && typeof body.code === "number" ? body.code : undefined;
  const reason = body && body.data && typeof body.data.reason === "string" ? body.data.reason : undefined;
  const kind =
    status === 401 ? "auth"
    : code === -2 || code === -3 ? "rejected"
    : reason === "insufficient_credits" ? "quota"
    : reason === "plan_required" ? "plan"
    : reason === "concurrency" ? "busy"
    : msg.toLowerCase().includes("no auth") ? "auth"
    : "other";
  return new FitvError(msg, kind, status, code, reason);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new FitvError(`no API key: create one at ${KEYS_URL}`, "auth");
  const res = await fetchImpl(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body || {}),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  return { status: res.status, json };
}

function buildBody(prompt, model, msg, config) {
  const pick = (k) => (msg[k] !== undefined ? msg[k] : config[k]);
  const options = { sound: true };
  if (pick("aspectRatio")) options.aspect_ratio = pick("aspectRatio");
  if (pick("resolution")) options.resolution = pick("resolution");
  const dur = Number(pick("duration"));
  if (dur) options.duration = dur;
  const image = msg.image || config.image;
  let scene = "text-to-video";
  if (image) {
    options.image_input = [String(image)];
    scene = "image-to-video";
  }
  return {
    provider: "auto",
    mediaType: "video",
    model: model || DEFAULT_MODEL,
    scene,
    prompt,
    options,
  };
}

async function submit(prompt, model, msg, config, apiKey, fetchImpl) {
  const r = await post("/api/ai/generate", buildBody(prompt, model, msg, config), apiKey, fetchImpl);
  if (r.status >= 400 || r.json.code !== 0) throw errorFor(r.status, r.json);
  const id = r.json.data && r.json.data.id;
  if (!id) throw new FitvError("the service returned no id", "other", r.status);
  return String(id);
}

async function waitFor(id, apiKey, timeoutMs, fetchImpl, pollMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const r = await post("/api/ai/query", { taskId: id }, apiKey, fetchImpl);
    if (r.status >= 400 || r.json.code !== 0) throw errorFor(r.status, r.json);
    const d = r.json.data || {};
    if (d.status === "success") {
      if (Array.isArray(d.videos) && d.videos[0]) return String(d.videos[0]);
      throw new FitvError("finished with no video", "failed");
    }
    if (d.status === "failed" || d.status === "canceled") {
      throw new FitvError(d.errorMessage || `run ${id} ${d.status}`, "failed");
    }
    if (Date.now() >= deadline) {
      throw new FitvError(`timed out; run ${id} may still finish`, "timeout");
    }
    await sleep(pollMs);
  }
}

module.exports = function (RED) {
  function FitvNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on("input", async (msg, send, done) => {
      const prompt = String(msg.prompt || (typeof msg.payload === "string" ? msg.payload : "") || config.prompt || "").trim();
      const model = msg.model || config.model || DEFAULT_MODEL;
      const apiKey = (node.credentials && node.credentials.apiKey) || process.env.FREEIMAGETOVIDEO_API_KEY || "";
      if (!prompt) {
        done(new Error("no prompt: set msg.payload to a string or fill in the node's Prompt"));
        return;
      }
      node.status({ fill: "blue", shape: "dot", text: "submitting" });
      try {
        const id = await submit(prompt, model, msg, config, apiKey);
        node.status({ fill: "blue", shape: "ring", text: `generating ${id.slice(0, 8)}` });
        const url = await waitFor(id, apiKey, Number(config.timeout || 1800) * 1000);
        msg.payload = url;
        msg.freeimagetovideo = { id, model, url };
        node.status({ fill: "green", shape: "dot", text: "done" });
        send(msg);
        done();
      } catch (e) {
        msg.freeimagetovideo = { error: e.message, kind: e.kind || "other", status: e.status, code: e.code };
        node.status({ fill: "red", shape: "ring", text: `${e.kind || "error"}: ${String(e.message).slice(0, 30)}` });
        done(e);
      }
    });
  }

  RED.nodes.registerType("fitv-generate", FitvNode, {
    credentials: { apiKey: { type: "password" } },
  });
};

module.exports.internals = { submit, waitFor, buildBody, errorFor, post, FitvError, BASE_URL, DEFAULT_MODEL };
