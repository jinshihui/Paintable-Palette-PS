var EVAL_SCRIPT_TIMEOUT_MS = 3000;
var PANEL_EXTENSION_ID = "com.jinshihui.paintablepalette.panel";
var AUTHOR_LINKS = {
  "contact-xiaohongshu": "https://www.xiaohongshu.com/user/profile/6464b7df0000000029013b0d",
  "contact-github": "https://github.com/jinshihui/Paintable-Palette-PS",
};

function eval_script(script_text) {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.evalScript !== "function") {
    return Promise.reject(new Error("__adobe_cep__.evalScript not available."));
  }
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) { settled = true; reject(new Error("evalScript timed out")); }
    }, EVAL_SCRIPT_TIMEOUT_MS);
    window.__adobe_cep__.evalScript(script_text, function (result) {
      if (!settled) { settled = true; clearTimeout(timer); resolve(result); }
    });
  });
}

function keep_panel_persistent() {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.dispatchEvent !== "function") return;

  try {
    var event = typeof window.CSEvent === "function"
      ? new window.CSEvent("com.adobe.PhotoshopPersistent", "APPLICATION")
      : { type: "com.adobe.PhotoshopPersistent", scope: "APPLICATION" };
    event.extensionId = PANEL_EXTENSION_ID;
    event.data = PANEL_EXTENSION_ID;
    window.__adobe_cep__.dispatchEvent(event);
    console.log("[paintablepalette] PhotoshopPersistent dispatched:", PANEL_EXTENSION_ID);
  } catch (err) {
    console.warn("[paintablepalette] keep panel persistent failed:", err);
  }
}

function return_focus_to_photoshop() {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.dispatchEvent !== "function") return;

  try {
    var event = typeof window.CSEvent === "function"
      ? new window.CSEvent("com.adobe.PhotoshopLoseFocus", "APPLICATION")
      : { type: "com.adobe.PhotoshopLoseFocus", scope: "APPLICATION" };
    event.extensionId = PANEL_EXTENSION_ID;
    window.__adobe_cep__.dispatchEvent(event);
  } catch (err) {
    console.warn("[paintablepalette] return focus failed:", err);
  }
}

function init_author_menu() {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.invokeSync !== "function") return;

  var menu_xml = '<Menu>' +
    '<MenuItem Label="联系作者" Enabled="false" Checked="false"/>' +
    '<MenuItem Id="contact-xiaohongshu" Label="小红书：金卉儿(日常版)" Enabled="true" Checked="false"/>' +
    '<MenuItem Id="contact-github" Label="GitHub" Enabled="true" Checked="false"/>' +
    '<MenuItem Label="版本：1.0.20｜Alt-only 稳定版（2026-07-15）" Enabled="false" Checked="false"/>' +
    '</Menu>';

  function on_menu_click(event) {
    var menu_id = event && event.data ? event.data.menuId : "";
    var url = AUTHOR_LINKS[menu_id];
    if (!url) return;

    if (window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === "function") {
      window.cep.util.openURLInDefaultBrowser(url);
    } else {
      set_status("ERROR(open URL): CEP browser API unavailable");
    }
  }

  try {
    window.__adobe_cep__.invokeSync("setPanelFlyoutMenu", menu_xml);
    if (typeof window.__adobe_cep__.addEventListener === "function") {
      window.__adobe_cep__.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", on_menu_click);
    }
  } catch (err) {
    console.warn("[paintablepalette] author menu init failed:", err);
  }
}

console.log("[paintablepalette] main.js loaded");

window.addEventListener("error", function (ev) {
  console.error("[paintablepalette] uncaught:", ev.message, ev.filename, ev.lineno);
  set_status("ERR: " + (ev.message || "unknown"));
});
window.addEventListener("unhandledrejection", function (ev) {
  var msg = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason);
  console.error("[paintablepalette] unhandled rejection:", msg);
  set_status("ERR: " + msg);
});

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

const W = 400;
const H = 400;
const BG_R = 232;
const BG_G = 232;
const BG_B = 232;
const DB_NAME = "paintablepalette";
const DB_VERSION = 1;
const DB_STORE = "state";
const DB_STATE_KEY = "main";
const LEGACY_LOCAL_STORAGE_KEYS = ["paintablepalette_state_v2", "paintablepalette_state_v1"];

let canvas_el;
let ctx;
let image_data;
let pixel_buffer;

let brush_radius = 20;
let brush_opacity = 0.1;
let brush_hardness = 1.0;
let brush_color = { r: 0, g: 0, b: 0 };
let color_mode = "rgb";
let is_drawing = false;
let pick_mode = false;
let alt_key_down = false;
let hover_alt_key_down = false;
let active_gesture_mode = null;
let active_pointer_id = null;
let foreground_sync_promise = null;
let pending_foreground_write = null;
let focus_returned_after_pick = false;
let foreground_sync_generation = 0;
let last_foreground_sync_ms = 0;
let last_x = null;
let last_y = null;

let needs_render = false;
let is_render_scheduled = false;
let last_render_ms = 0;
const MIN_RENDER_INTERVAL_MS = 16;

let last_pick_ms = 0;
const MIN_PICK_INTERVAL_MS = 16;
const MIN_FOREGROUND_SYNC_INTERVAL_MS = 80;

let save_timer_id = null;
let save_scheduled = false;
const SAVE_DEBOUNCE_MS = 250;
let has_unsaved_changes = false;

let db_promise = null;

function init_buffers() {
  pixel_buffer = new Uint8ClampedArray(W * H * 4);

  for (let i = 0; i < W * H; i++) {
    const idx = i * 4;
    pixel_buffer[idx] = BG_R;
    pixel_buffer[idx + 1] = BG_G;
    pixel_buffer[idx + 2] = BG_B;
    pixel_buffer[idx + 3] = 255;
  }
}

function open_db() {
  if (db_promise) return db_promise;

  const IDB_TIMEOUT_MS = 3000;

  db_promise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("indexedDB not available"));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("indexedDB open timed out"));
      }
    }, IDB_TIMEOUT_MS);

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(req.result); }
    };
    req.onerror = () => {
      if (!settled) { settled = true; clearTimeout(timer); reject(req.error || new Error("indexedDB open failed")); }
    };
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

  const s = record.settings;
  if (s) {
    if (typeof s.brush_radius === "number") brush_radius = s.brush_radius;
    if (typeof s.brush_opacity === "number") brush_opacity = s.brush_opacity;
    if (typeof s.brush_hardness === "number") brush_hardness = s.brush_hardness;
    if (s.color_mode === "rgb") color_mode = s.color_mode;
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

    if (state.settings) {
      if (typeof state.settings.brush_radius === "number") brush_radius = state.settings.brush_radius;
      if (typeof state.settings.brush_opacity === "number") brush_opacity = state.settings.brush_opacity;
      if (typeof state.settings.brush_hardness === "number") brush_hardness = state.settings.brush_hardness;
      if (state.settings.color_mode === "rgb") color_mode = state.settings.color_mode;
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
  return pick_mode || !!(e && e.altKey);
}

function update_pick_cursor() {
  if (!canvas_el || !canvas_el.classList) return;
  if (pick_mode || alt_key_down || hover_alt_key_down) {
    canvas_el.classList.add("is-picking");
  } else {
    canvas_el.classList.remove("is-picking");
  }
}

function sync_hover_shortcut(e) {
  hover_alt_key_down = !!(e && e.altKey);
  alt_key_down = hover_alt_key_down;
  if (e && (e.type === "pointerenter" || e.type === "mouseenter") && e.buttons) {
    reset_pointer_gesture();
  }
  update_pick_cursor();
}

function sync_foreground_color(force) {
  if (pending_foreground_write) return pending_foreground_write;
  var now = Date.now();
  if (!force && now - last_foreground_sync_ms < MIN_FOREGROUND_SYNC_INTERVAL_MS) {
    return foreground_sync_promise || Promise.resolve(null);
  }
  if (foreground_sync_promise) return foreground_sync_promise;
  last_foreground_sync_ms = now;
  var generation = foreground_sync_generation;
  foreground_sync_promise = get_foreground_rgb().then(function (fg) {
    if (generation === foreground_sync_generation) {
      brush_color = fg;
      set_swatch(fg);
    }
    foreground_sync_promise = null;
    return fg;
  }, function (err) {
    foreground_sync_promise = null;
    console.warn("[paintablepalette] foreground preload failed:", err);
    return null;
  });
  return foreground_sync_promise;
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

      const idx = (py * W + px) * 4;
      pixel_buffer[idx] = Math.round((1 - a) * pixel_buffer[idx] + a * rgb.r);
      pixel_buffer[idx + 1] = Math.round((1 - a) * pixel_buffer[idx + 1] + a * rgb.g);
      pixel_buffer[idx + 2] = Math.round((1 - a) * pixel_buffer[idx + 2] + a * rgb.b);
      pixel_buffer[idx + 3] = 255;
    }
  }
}

function draw_stamp(cx, cy) {
  update_pixel_buffer_rgb(cx, cy, brush_radius, brush_color);
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

function do_pick_color(x, y, force) {
  const now = Date.now();
  if (!force && now - last_pick_ms < MIN_PICK_INTERVAL_MS) return;
  last_pick_ms = now;

  const rgb = get_pixel(x, y);
  foreground_sync_generation += 1;
  brush_color = rgb;
  set_swatch(rgb);
  update_pick_cursor();
  set_status(`Picked: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
}

function reset_pointer_gesture() {
  is_drawing = false;
  active_gesture_mode = null;
  active_pointer_id = null;
  last_x = null;
  last_y = null;
}

function on_pointer_down(e) {
  reset_pointer_gesture();
  focus_returned_after_pick = false;
  var pos = get_pos(e);
  if (pos.x < 0 || pos.y < 0 || pos.x >= W || pos.y >= H) {
    return;
  }
  active_pointer_id = e && e.pointerId != null ? e.pointerId : null;
  active_gesture_mode = is_pick_mode(e) ? "pick" : "paint";

  if (e.pointerType !== "pen" && e.pointerId != null && canvas_el && canvas_el.setPointerCapture) {
    try { canvas_el.setPointerCapture(e.pointerId); } catch (_) {}
  }

  if (active_gesture_mode === "pick") {
    do_pick_color(pos.x, pos.y, true);
    return;
  }

  is_drawing = true;
  set_status("Paint: rgb(" + brush_color.r + ", " + brush_color.g + ", " + brush_color.b + ")");
  draw_stamp(pos.x, pos.y);
  last_x = pos.x;
  last_y = pos.y;
}

function on_pointer_move(e) {
  if (!active_gesture_mode) return;
  if (active_pointer_id != null && e.pointerId != null && e.pointerId !== active_pointer_id) return;
  if (typeof e.buttons === "number" && e.buttons === 0) {
    reset_pointer_gesture();
    return;
  }
  var pos = get_pos(e);
  if (active_gesture_mode === "pick") {
    do_pick_color(pos.x, pos.y, false);
  } else if (is_drawing) {
    draw_stroke_to(pos.x, pos.y);
  }
}

async function on_pointer_up(e) {
  if (active_pointer_id != null && e && e.pointerId != null && e.pointerId !== active_pointer_id) return;
  var gesture_mode = active_gesture_mode;
  var had_active_gesture = gesture_mode !== null;
  var ended_outside = e && (e.type === "pointerleave" || e.type === "mouseleave" || e.type === "pointercancel");
  reset_pointer_gesture();

  if (gesture_mode === "pick") {
    var foreground_write = set_foreground_rgb(brush_color).catch(function (err) {
      set_status(`ERROR(set fg): ${err && err.message ? err.message : String(err)}`);
      return null;
    });
    pending_foreground_write = foreground_write;
    foreground_write.then(function () {
      if (pending_foreground_write === foreground_write) pending_foreground_write = null;
    });
  }
  if (had_active_gesture && has_unsaved_changes) save_state_to_idb();

  if (gesture_mode === "pick" && !ended_outside) {
    if (pending_foreground_write) await pending_foreground_write;
    focus_returned_after_pick = true;
    return_focus_to_photoshop();
  }

  if (ended_outside) {
    if (pending_foreground_write) await pending_foreground_write;
    if (!focus_returned_after_pick) {
      return_focus_to_photoshop();
    }
    focus_returned_after_pick = false;
  }
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
      update_pick_cursor();
      set_status(pick_mode ? "Pick mode ON (click/drag to pick)" : "Paint mode");
    });
  }
}

async function init() {
  const t0 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  canvas_el = document.getElementById("palette-canvas");
  keep_panel_persistent();
  init_author_menu();
  if (!canvas_el) {
    set_status("ERROR: canvas not found");
    return;
  }
  canvas_el.tabIndex = -1;

  ctx = canvas_el.getContext("2d", { willReadFrequently: false }) || canvas_el.getContext("2d");
  if (!ctx) {
    set_status("ERROR: 2d context not available");
    return;
  }
  image_data = ctx.createImageData(W, H);
  init_buffers();

  image_data.data.set(pixel_buffer);
  ctx.putImageData(image_data, 0, 0);

  bind_ui();

  const mode_el = document.getElementById("select-mode");
  if (mode_el) {
    mode_el.value = color_mode;
    if (mode_el.value !== color_mode) {
      color_mode = "rgb";
      mode_el.value = color_mode;
    }
  }

  // 同时绑 pointer + mouse 事件，防止某些 Mac CEF 中 PointerEvent 存在但不触发
  var pointer_active = false;
  function wrap_down(ev) {
    if (ev.type === "pointerdown") pointer_active = true;
    if (ev.type === "mousedown" && pointer_active) return;
    on_pointer_down(ev);
    sync_hover_shortcut(ev);
  }
  function wrap_move(ev) {
    sync_hover_shortcut(ev);
    if (ev.type === "mousemove" && pointer_active) return;
    if (!active_gesture_mode && ev.buttons === 0 && !is_pick_mode(ev)) sync_foreground_color(false);
    on_pointer_move(ev);
  }
  function wrap_up(ev) {
    if (ev.type === "pointerleave" || ev.type === "mouseleave") {
      hover_alt_key_down = false;
      update_pick_cursor();
    } else {
      sync_hover_shortcut(ev);
    }
    if ((ev.type === "mouseup" || ev.type === "mouseleave") && pointer_active) return;
    on_pointer_up(ev);
    if (ev.type.indexOf("pointer") === 0) setTimeout(function () { pointer_active = false; }, 0);
  }

  if (typeof PointerEvent !== "undefined") {
    canvas_el.addEventListener("pointerenter", sync_hover_shortcut);
    canvas_el.addEventListener("pointerenter", function (e) {
      if (!is_pick_mode(e)) sync_foreground_color(true);
    });
    canvas_el.addEventListener("pointerdown", wrap_down);
    canvas_el.addEventListener("pointermove", wrap_move);
    canvas_el.addEventListener("pointerup", wrap_up);
    canvas_el.addEventListener("pointercancel", wrap_up);
    canvas_el.addEventListener("pointerleave", wrap_up);
  }
  canvas_el.addEventListener("mouseenter", sync_hover_shortcut);
  canvas_el.addEventListener("mouseenter", function (e) {
    if (!is_pick_mode(e)) sync_foreground_color(true);
  });
  canvas_el.addEventListener("mousedown", wrap_down);
  canvas_el.addEventListener("mousemove", wrap_move);
  canvas_el.addEventListener("mouseup", wrap_up);
  canvas_el.addEventListener("mouseleave", wrap_up);

  document.addEventListener("keydown", function (e) {
    if (e.keyCode === 18 || e.key === "Alt") alt_key_down = true;
    update_pick_cursor();
  });
  document.addEventListener("keyup", function (e) {
    if (e.keyCode === 18 || e.key === "Alt") alt_key_down = false;
    update_pick_cursor();
  });
  window.addEventListener("blur", function () {
    alt_key_down = false;
    hover_alt_key_down = false;
    reset_pointer_gesture();
    update_pick_cursor();
  });

  console.log("[paintablepalette] bindEvents ok.");

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

  if (restored) {
    image_data.data.set(pixel_buffer);
    ctx.putImageData(image_data, 0, 0);
  }

  console.log("[paintablepalette] init ok.");
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

document.addEventListener("DOMContentLoaded", function () {
  init().catch(function (err) {
    console.error("[paintablepalette] init fatal:", err);
    set_status("FATAL: " + (err && err.message ? err.message : String(err)));
  });
});
