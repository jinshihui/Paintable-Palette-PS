function eval_script(script_text) {
  if (!window.__adobe_cep__ || typeof window.__adobe_cep__.evalScript !== "function") {
    throw new Error("__adobe_cep__.evalScript not available. Are you running in a CEP panel?");
  }
  return new Promise((resolve) => {
    window.__adobe_cep__.evalScript(script_text, resolve);
  });
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
  const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
  await eval_script(`mixboxpalette_setForegroundRGB(${r}, ${g}, ${b})`);
}

async function on_get_fg() {
  try {
    const rgb = await get_foreground_rgb();
    set_swatch(rgb);
    set_status(`FG: rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  } catch (err) {
    set_status(`ERROR: ${err && err.message ? err.message : String(err)}`);
  }
}

async function on_set_red() {
  try {
    await set_foreground_rgb({ r: 255, g: 0, b: 0 });
    await on_get_fg();
  } catch (err) {
    set_status(`ERROR: ${err && err.message ? err.message : String(err)}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const get_fg_btn = document.getElementById("btn-get-fg");
  const set_red_btn = document.getElementById("btn-set-red");

  if (get_fg_btn) get_fg_btn.addEventListener("click", on_get_fg);
  if (set_red_btn) set_red_btn.addEventListener("click", on_set_red);

  on_get_fg();
});

