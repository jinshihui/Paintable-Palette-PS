function eval_script(script_text) {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.evalScript !== "function") {
    throw new Error("__adobe_cep__.evalScript not available. Are you running in a CEP panel?");
  }
  return new Promise((resolve) => window.__adobe_cep__.evalScript(script_text, resolve));
}

console.log("[paintablepalette] main.js loaded");

let mixbox_load_promise = null;
function ensure_mixbox_loaded() {
  if (window.mixbox && typeof window.mixbox.rgbToLatent === "function") return Promise.resolve(true);
  if (mixbox_load_promise) return mixbox_load_promise;

  mixbox_load_promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "js/mixbox.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load js/mixbox.js"));
    document.head.appendChild(script);
  }).catch((err) => {
    mixbox_load_promise = null;
    throw err;
  });

  return mixbox_load_promise;
}

function clamp_0_255(value) {
  return Math.max(0, Math.min(255, value));
}

function base64_to_bytes(base64_string) {
  const binary = atob(base64_string);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function set_status(message) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = message;
}

function set_swatch(rgb) {
  const el = document.getElementById("fg-swatch");
  if (!el) return;
  el.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

async function get_foreground_rgb() {
  const result = await eval_script("paintablepalette_getForegroundRGB()");
  if (!result) throw new Error("Empty result from ExtendScript.");
  return JSON.parse(result);
}

async function set_foreground_rgb(rgb) {
  const r = clamp_0_255(Math.round(rgb.r));
  const g = clamp_0_255(Math.round(rgb.g));
  const b = clamp_0_255(Math.round(rgb.b));
  const result = await eval_script(`paintablepalette_setForegroundRGB(${r}, ${g}, ${b})`);
  if (result && String(result).toUpperCase() !== "OK") {
    throw new Error(`ExtendScript returned: ${result}`);
  }
}

const W = 300;
const H = 300;
const BG_R = 232;
const BG_G = 232;
const BG_B = 232;
const LATENT_SIZE = 7;
const DB_NAME = "paintablepalette";
const DB_VERSION = 1;
const DB_STORE = "state";
const DB_STATE_KEY = "main";
const LEGACY_LOCAL_STORAGE_KEYS = ["paintablepalette_state_v2", "paintablepalette_state_v1"];

let canvas_el;
let ctx;
let image_data;
let pixel_buffer;
let latent_buffer;
let latent_dirty;
let latent_tmp;

let brush_radius = 20;
let brush_opacity = 0.1;
let brush_hardness = 1.0;
let brush_color = { r: 0, g: 0, b: 0 };
let color_mode = "rgb";
let is_drawing = false;
let pick_mode = false;
let last_x = null;
let last_y = null;

let needs_render = false;
let is_render_scheduled = false;
let last_render_ms = 0;
const MIN_RENDER_INTERVAL_MS = 33;

let last_pick_ms = 0;
const MIN_PICK_INTERVAL_MS = 80;

let save_timer_id = null;
let save_scheduled = false;
const SAVE_DEBOUNCE_MS = 250;
let has_unsaved_changes = false;

let db_promise = null;

function init_buffers() {
  pixel_buffer = new Uint8ClampedArray(W * H * 4);
  latent_buffer = new Float32Array(W * H * LATENT_SIZE);
  latent_dirty = new Uint8Array(W * H);
  latent_tmp = new Array(LATENT_SIZE);

  for (let i = 0; i < W * H; i++) {
    const idx = i * 4;
    pixel_buffer[idx] = BG_R;
    pixel_buffer[idx + 1] = BG_G;
    pixel_buffer[idx + 2] = BG_B;
    pixel_buffer[idx + 3] = 255;
  }

  // Mixbox 首次用到某像素时再从 pixel_buffer 同步 latent，避免初始化成本。
  latent_dirty.fill(1);
}

function open_db() {
  if (db_promise) return db_promise;

  db_promise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("indexedDB not available"));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
  });

  return db_promise;
}

async function idb_get_state() {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.get(DB_STATE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("indexedDB get failed"));
  });
}

async function idb_put_state(record) {
  const db = await open_db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const req = store.put(record);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("indexedDB put failed"));
  });
}

function restore_state_from_record(record) {
  if (!record || record.v !== 2 || record.w !== W || record.h !== H) return false;

  let bytes = null;
  if (record.pixel_u8 instanceof Uint8Array) {
    bytes = record.pixel_u8;
  } else if (record.pixel_ab instanceof ArrayBuffer) {
    bytes = new Uint8Array(record.pixel_ab);
  }
  if (!bytes) return false;

  if (bytes.length !== W * H * 4) return false;
  pixel_buffer.set(bytes);
  latent_dirty.fill(1);

  const s = record.settings;
  if (s) {
    if (typeof s.brush_radius === "number") brush_radius = s.brush_radius;
    if (typeof s.brush_opacity === "number") brush_opacity = s.brush_opacity;
    if (typeof s.brush_hardness === "number") brush_hardness = s.brush_hardness;
    if (s.color_mode === "rgb" || s.color_mode === "mixbox") color_mode = s.color_mode;
  }

  return true;
}

function try_migrate_legacy_local_storage_state() {
  if (!window.localStorage) return null;

  let raw = null;
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    raw = window.localStorage.getItem(key);
    if (raw) break;
  }
  if (!raw) return null;

  let state;
  try {
    state = JSON.parse(raw);
  } catch (err) {
    console.warn("[paintablepalette] legacy restore: invalid JSON:", err);
    return null;
  }

  if (!state || state.v !== 1 || state.w !== W || state.h !== H) return null;
  if (typeof state.pixel_b64 !== "string") return null;

  try {
    const pixel_bytes = base64_to_bytes(state.pixel_b64);
    if (pixel_bytes.length !== W * H * 4) return null;
    pixel_buffer.set(pixel_bytes);
    latent_dirty.fill(1);

    if (state.settings) {
      if (typeof state.settings.brush_radius === "number") brush_radius = state.settings.brush_radius;
      if (typeof state.settings.brush_opacity === "number") brush_opacity = state.settings.brush_opacity;
      if (typeof state.settings.brush_hardness === "number") brush_hardness = state.settings.brush_hardness;
      if (state.settings.color_mode === "rgb" || state.settings.color_mode === "mixbox") color_mode = state.settings.color_mode;
    }

    return { migrated: true };
  } catch (err) {
    console.warn("[paintablepalette] legacy restore failed:", err);
    return null;
  }
}

function save_state_to_idb() {
  if (!pixel_buffer) return;

  const pixel_u8 = new Uint8Array(pixel_buffer.buffer, pixel_buffer.byteOffset, pixel_buffer.byteLength);
  const pixel_copy = new Uint8Array(pixel_u8);

  const record = {
    id: DB_STATE_KEY,
    v: 2,
    w: W,
    h: H,
    saved_at_ms: Date.now(),
    pixel_u8: pixel_copy,
    settings: {
      brush_radius,
      brush_opacity,
      brush_hardness,
      color_mode,
    },
  };

  idb_put_state(record)
    .then(() => {
      has_unsaved_changes = false;
    })
    .catch((err) => console.warn("[paintablepalette] idb save failed:", err));
}

function mark_unsaved_changes() {
  has_unsaved_changes = true;
}

function schedule_save() {
  save_scheduled = true;
  if (save_timer_id !== null) return;

  save_timer_id = window.setTimeout(() => {
    save_timer_id = null;
    if (!save_scheduled) return;
    save_scheduled = false;
    save_state_to_idb();
  }, SAVE_DEBOUNCE_MS);
}

function schedule_render() {
  needs_render = true;
  if (is_render_scheduled) return;
  is_render_scheduled = true;
  requestAnimationFrame(render_if_needed);
}

function render_if_needed() {
  if (!needs_render) {
    is_render_scheduled = false;
    return;
  }
  const now = Date.now();
  if (now - last_render_ms < MIN_RENDER_INTERVAL_MS) {
    requestAnimationFrame(render_if_needed);
    return;
  }
  last_render_ms = now;

  image_data.data.set(pixel_buffer);
  ctx.putImageData(image_data, 0, 0);

  needs_render = false;
  is_render_scheduled = false;
}

function get_pos(e) {
  const rect = canvas_el.getBoundingClientRect();
  const scale_x = W / rect.width;
  const scale_y = H / rect.height;
  return {
    x: (e.clientX - rect.left) * scale_x,
    y: (e.clientY - rect.top) * scale_y,
  };
}

function get_pixel(x, y) {
  const px = Math.max(0, Math.min(W - 1, Math.round(x)));
  const py = Math.max(0, Math.min(H - 1, Math.round(y)));
  const idx = (py * W + px) * 4;
  return { r: pixel_buffer[idx], g: pixel_buffer[idx + 1], b: pixel_buffer[idx + 2] };
}

function is_pick_mode(e) {
  return pick_mode || (e && e.altKey);
}

function update_pixel_buffer_rgb(cx, cy, radius, rgb) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(W, Math.ceil(cx + radius));
  const y1 = Math.min(H, Math.ceil(cy + radius));

  const hardness = Math.max(0, Math.min(1, brush_hardness));
  const inner = radius * hardness;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;

      let a = brush_opacity;
      if (hardness < 1) {
        const d = Math.sqrt(d2);
        if (d > inner) {
          const denom = radius - inner;
          const t = denom > 0 ? (radius - d) / denom : 0;
          a = a * Math.max(0, Math.min(1, t));
        }
      }
      if (a <= 0) continue;

      const p = py * W + px;
      latent_dirty[p] = 1;
      const idx = (py * W + px) * 4;
      pixel_buffer[idx] = Math.round((1 - a) * pixel_buffer[idx] + a * rgb.r);
      pixel_buffer[idx + 1] = Math.round((1 - a) * pixel_buffer[idx + 1] + a * rgb.g);
      pixel_buffer[idx + 2] = Math.round((1 - a) * pixel_buffer[idx + 2] + a * rgb.b);
      pixel_buffer[idx + 3] = 255;
    }
  }
}

function update_pixel_buffer_mixbox(cx, cy, radius, rgb) {
  if (!window.mixbox || typeof window.mixbox.rgbToLatent !== "function") {
    throw new Error("mixbox not loaded (js/mixbox.js missing?)");
  }

  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(W, Math.ceil(cx + radius));
  const y1 = Math.min(H, Math.ceil(cy + radius));

  const hardness = Math.max(0, Math.min(1, brush_hardness));
  const inner = radius * hardness;

  const brush_latent = window.mixbox.rgbToLatent([rgb.r, rgb.g, rgb.b]);

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= radius * radius) continue;

      let a = brush_opacity;
      if (hardness < 1) {
        const d = Math.sqrt(d2);
        if (d > inner) {
          const denom = radius - inner;
          const t = denom > 0 ? (radius - d) / denom : 0;
          a = a * Math.max(0, Math.min(1, t));
        }
      }
      if (a <= 0) continue;

      const p = py * W + px;
      const li = p * LATENT_SIZE;
      const ri = p * 4;

      if (latent_dirty[p]) {
        const base_latent = window.mixbox.rgbToLatent([
          pixel_buffer[ri],
          pixel_buffer[ri + 1],
          pixel_buffer[ri + 2],
        ]);
        for (let j = 0; j < LATENT_SIZE; j++) latent_buffer[li + j] = base_latent[j];
        latent_dirty[p] = 0;
      }

      for (let j = 0; j < LATENT_SIZE; j++) {
        latent_buffer[li + j] = (1 - a) * latent_buffer[li + j] + a * brush_latent[j];
        latent_tmp[j] = latent_buffer[li + j];
      }

      const result = window.mixbox.latentToRgb(latent_tmp);
      pixel_buffer[ri] = result[0];
      pixel_buffer[ri + 1] = result[1];
      pixel_buffer[ri + 2] = result[2];
      pixel_buffer[ri + 3] = 255;
    }
  }
}

function draw_stamp(cx, cy) {
  if (color_mode === "mixbox") {
    try {
      update_pixel_buffer_mixbox(cx, cy, brush_radius, brush_color);
    } catch (err) {
      console.warn("[paintablepalette] mixbox draw failed, fallback to rgb:", err);
      set_status(`Mixbox ERROR, fallback RGB: ${err && err.message ? err.message : String(err)}`);
      update_pixel_buffer_rgb(cx, cy, brush_radius, brush_color);
    }
  } else {
    update_pixel_buffer_rgb(cx, cy, brush_radius, brush_color);
  }
  schedule_render();
  mark_unsaved_changes();
}

function draw_stroke_to(x, y) {
  if (last_x === null) {
    draw_stamp(x, y);
    last_x = x;
    last_y = y;
    return;
  }

  const dx = x - last_x;
  const dy = y - last_y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const spacing = Math.max(2, brush_radius * 0.3);
  if (dist < spacing) return;

  const steps = Math.ceil(dist / spacing);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    draw_stamp(last_x + dx * t, last_y + dy * t);
  }
  last_x = x;
  last_y = y;
}

async function do_pick_color(x, y) {
  const now = Date.now();
  if (now - last_pick_ms < MIN_PICK_INTERVAL_MS) return;
  last_pick_ms = now;

  const rgb = get_pixel(x, y);
  set_swatch(rgb);
  set_status(`Picked: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);

  try {
    await set_foreground_rgb(rgb);
  } catch (err) {
    set_status(`ERROR(set fg): ${err && err.message ? err.message : String(err)}`);
  }
}

async function on_pointer_down(e) {
  is_drawing = true;
  last_x = null;
  last_y = null;

  if (canvas_el && canvas_el.setPointerCapture) {
    try {
      canvas_el.setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
  }

  const pos = get_pos(e);
  if (is_pick_mode(e)) {
    await do_pick_color(pos.x, pos.y);
    return;
  }

  if (color_mode === "mixbox" && (!window.mixbox || typeof window.mixbox.rgbToLatent !== "function")) {
    set_status("Loading Mixbox...");
    try {
      await ensure_mixbox_loaded();
      set_status("Mixbox loaded");
    } catch (err) {
      set_status(`ERROR(load mixbox): ${err && err.message ? err.message : String(err)}`);
    }
  }

  try {
    const fg = await get_foreground_rgb();
    brush_color = fg;
    set_swatch(fg);
  } catch (err) {
    set_status(`WARN(read fg): ${err && err.message ? err.message : String(err)}`);
  }

  set_status(`Paint: rgb(${brush_color.r}, ${brush_color.g}, ${brush_color.b})`);
  draw_stamp(pos.x, pos.y);
}

async function on_pointer_move(e) {
  if (!is_drawing) return;
  const pos = get_pos(e);
  if (is_pick_mode(e)) {
    await do_pick_color(pos.x, pos.y);
  } else {
    if (color_mode === "mixbox" && (!window.mixbox || typeof window.mixbox.rgbToLatent !== "function")) {
      try {
        await ensure_mixbox_loaded();
      } catch (err) {
        set_status(`ERROR(load mixbox): ${err && err.message ? err.message : String(err)}`);
        return;
      }
    }
    draw_stroke_to(pos.x, pos.y);
  }
}

function on_pointer_up() {
  is_drawing = false;
  last_x = null;
  last_y = null;
  if (has_unsaved_changes) save_state_to_idb();
}

function do_clear() {
  init_buffers();
  schedule_render();
  set_status(`Cleared (${color_mode})`);
  mark_unsaved_changes();
  save_state_to_idb();
}

function bind_ui() {
  const mode_el = document.getElementById("select-mode");
  const clear_el = document.getElementById("btn-clear");
  const pick_el = document.getElementById("btn-pick");

  if (mode_el) {
    mode_el.addEventListener("change", (e) => {
      color_mode = e.target.value;
      set_status(`Mode: ${color_mode}`);
      mark_unsaved_changes();
      schedule_save();
    });
  }

  if (clear_el) clear_el.addEventListener("click", do_clear);

  if (pick_el) {
    pick_el.addEventListener("click", () => {
      pick_mode = !pick_mode;
      pick_el.textContent = pick_mode ? "Pick ✓" : "Pick";
      set_status(pick_mode ? "Pick mode ON (click/drag to pick)" : "Paint mode");
    });
  }
}

async function init() {
  const t0 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  canvas_el = document.getElementById("palette-canvas");
  if (!canvas_el) {
    set_status("ERROR: canvas not found");
    return;
  }

  ctx = canvas_el.getContext("2d", { willReadFrequently: false }) || canvas_el.getContext("2d");
  if (!ctx) {
    set_status("ERROR: 2d context not available");
    return;
  }
  image_data = ctx.createImageData(W, H);
  init_buffers();
  let restored = false;
  let migrated = false;
  try {
    const record = await idb_get_state();
    restored = restore_state_from_record(record);
  } catch (err) {
    console.warn("[paintablepalette] idb restore failed:", err);
  }

  if (!restored) {
    const legacy = try_migrate_legacy_local_storage_state();
    if (legacy) {
      migrated = true;
      restored = true;
      mark_unsaved_changes();
      save_state_to_idb();
      if (window.localStorage) {
        for (const key of LEGACY_LOCAL_STORAGE_KEYS) window.localStorage.removeItem(key);
      }
    }
  }

  image_data.data.set(pixel_buffer);
  ctx.putImageData(image_data, 0, 0);

  bind_ui();

  const mode_el = document.getElementById("select-mode");
  if (mode_el) mode_el.value = color_mode;

  canvas_el.addEventListener("pointerdown", on_pointer_down);
  canvas_el.addEventListener("pointermove", on_pointer_move);
  canvas_el.addEventListener("pointerup", on_pointer_up);
  canvas_el.addEventListener("pointerleave", on_pointer_up);

  console.log("[paintablepalette] init ok. mixbox loaded:", !!(window.mixbox && window.mixbox.lerp));
  if (restored) console.log("[paintablepalette] state restored from indexedDB");
  if (migrated) console.log("[paintablepalette] legacy localStorage migrated to indexedDB");

  try {
    const fg = await get_foreground_rgb();
    brush_color = fg;
    set_swatch(fg);
    set_status(`Ready (${color_mode}) FG: rgb(${fg.r}, ${fg.g}, ${fg.b})`);
  } catch (err) {
    set_status(`Ready (${color_mode}). WARN(read fg): ${err && err.message ? err.message : String(err)}`);
  }

  const t1 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  console.log("[paintablepalette] init time ms:", Math.round(t1 - t0));
}

document.addEventListener("DOMContentLoaded", init);
