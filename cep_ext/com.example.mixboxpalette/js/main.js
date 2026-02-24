function eval_script(script_text) {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.evalScript !== "function") {
    throw new Error("__adobe_cep__.evalScript not available. Are you running in a CEP panel?");
  }
  return new Promise((resolve) => window.__adobe_cep__.evalScript(script_text, resolve));
}

function clamp_0_255(value) {
  return Math.max(0, Math.min(255, value));
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
  const result = await eval_script("mixboxpalette_getForegroundRGB()");
  if (!result) throw new Error("Empty result from ExtendScript.");
  return JSON.parse(result);
}

async function set_foreground_rgb(rgb) {
  const r = clamp_0_255(Math.round(rgb.r));
  const g = clamp_0_255(Math.round(rgb.g));
  const b = clamp_0_255(Math.round(rgb.b));
  const result = await eval_script(`mixboxpalette_setForegroundRGB(${r}, ${g}, ${b})`);
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

function init_buffers() {
  pixel_buffer = new Uint8ClampedArray(W * H * 4);
  latent_buffer = new Float64Array(W * H * LATENT_SIZE);
  latent_dirty = new Uint8Array(W * H);
  latent_tmp = new Array(LATENT_SIZE);

  const can_init_latent = window.mixbox && typeof window.mixbox.rgbToLatent === "function";
  const bg_latent = can_init_latent ? window.mixbox.rgbToLatent([BG_R, BG_G, BG_B]) : null;

  for (let i = 0; i < W * H; i++) {
    const idx = i * 4;
    pixel_buffer[idx] = BG_R;
    pixel_buffer[idx + 1] = BG_G;
    pixel_buffer[idx + 2] = BG_B;
    pixel_buffer[idx + 3] = 255;

    if (bg_latent) {
      const li = i * LATENT_SIZE;
      for (let j = 0; j < LATENT_SIZE; j++) latent_buffer[li + j] = bg_latent[j];
    }
  }
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
      console.warn("[mixboxpalette] mixbox draw failed, fallback to rgb:", err);
      set_status(`Mixbox ERROR, fallback RGB: ${err && err.message ? err.message : String(err)}`);
      update_pixel_buffer_rgb(cx, cy, brush_radius, brush_color);
    }
  } else {
    update_pixel_buffer_rgb(cx, cy, brush_radius, brush_color);
  }
  schedule_render();
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
    draw_stroke_to(pos.x, pos.y);
  }
}

function on_pointer_up() {
  is_drawing = false;
  last_x = null;
  last_y = null;
}

function do_clear() {
  init_buffers();
  schedule_render();
  set_status(`Cleared (${color_mode})`);
}

function bind_ui() {
  const size_el = document.getElementById("slider-size");
  const opacity_el = document.getElementById("slider-opacity");
  const hardness_el = document.getElementById("slider-hardness");
  const mode_el = document.getElementById("select-mode");
  const clear_el = document.getElementById("btn-clear");
  const pick_el = document.getElementById("btn-pick");

  if (size_el) size_el.addEventListener("input", (e) => (brush_radius = parseInt(e.target.value, 10)));
  if (opacity_el) opacity_el.addEventListener("input", (e) => (brush_opacity = parseInt(e.target.value, 10) / 100));
  if (hardness_el) hardness_el.addEventListener("input", (e) => (brush_hardness = parseInt(e.target.value, 10) / 100));

  if (mode_el) {
    mode_el.addEventListener("change", (e) => {
      color_mode = e.target.value;
      set_status(`Mode: ${color_mode}`);
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
  image_data.data.set(pixel_buffer);
  ctx.putImageData(image_data, 0, 0);

  bind_ui();

  canvas_el.addEventListener("pointerdown", on_pointer_down);
  canvas_el.addEventListener("pointermove", on_pointer_move);
  canvas_el.addEventListener("pointerup", on_pointer_up);
  canvas_el.addEventListener("pointerleave", on_pointer_up);

  console.log("[mixboxpalette] init ok. mixbox loaded:", !!(window.mixbox && window.mixbox.lerp));

  try {
    const fg = await get_foreground_rgb();
    brush_color = fg;
    set_swatch(fg);
    set_status(`Ready (${color_mode}) FG: rgb(${fg.r}, ${fg.g}, ${fg.b})`);
  } catch (err) {
    set_status(`Ready (${color_mode}). WARN(read fg): ${err && err.message ? err.message : String(err)}`);
  }
}

document.addEventListener("DOMContentLoaded", init);
