/* global mixbox */

let surface_el;
let ctx;
let image_data;
let rgba_buffer;

let initialized = false;
let isDrawing = false;
let brushRadius = 20;
let brushOpacity = 0.10;
let brushColor = { r: 0, g: 0, b: 0 };
let pickMode = false;
let colorMode = "rgb"; // "rgb" or "mixbox"
let lastX = null, lastY = null;

const BG_R = 232, BG_G = 232, BG_B = 232;
const W = 300, H = 300;

// --- Buffer 系统 ---
// pixelBuffer: RGB 值，用于吸色和 RGB 模式混色
// latentBuffer: Mixbox latent[7] 值，用于 Mixbox 模式混色
let pixelBuffer = null;
let latentBuffer = null;
let latent_dirty = null;
const LATENT_SIZE = 7;  // mixbox latent 维度

let is_render_scheduled = false;
let needs_render = false;
let last_render_ms = 0;
const MIN_RENDER_INTERVAL_MS = 33;
let latent_tmp = null;

function initBuffers() {
    pixelBuffer = new Uint8Array(W * H * 3);
    latentBuffer = new Float64Array(W * H * LATENT_SIZE);
    latent_dirty = new Uint8Array(W * H);
    const bgLatent = mixbox.rgbToLatent([BG_R, BG_G, BG_B]);
    for (let i = 0; i < W * H; i++) {
        pixelBuffer[i * 3] = BG_R;
        pixelBuffer[i * 3 + 1] = BG_G;
        pixelBuffer[i * 3 + 2] = BG_B;
        for (let j = 0; j < LATENT_SIZE; j++) {
            latentBuffer[i * LATENT_SIZE + j] = bgLatent[j];
        }
    }
    console.log("[palette][cep] buffers initialized (RGB + Latent)");
}

function renderToSurfaceIfNeeded() {
    if (!needs_render) {
        is_render_scheduled = false;
        return;
    }

    const now = Date.now();
    if (now - last_render_ms < MIN_RENDER_INTERVAL_MS) {
        requestAnimationFrame(renderToSurfaceIfNeeded);
        return;
    }
    last_render_ms = now;

    // pixelBuffer(RGB) -> rgba_buffer(RGBA)
    for (let i = 0, p = 0; i < W * H; i++, p += 3) {
        const o = i * 4;
        rgba_buffer[o] = pixelBuffer[p];
        rgba_buffer[o + 1] = pixelBuffer[p + 1];
        rgba_buffer[o + 2] = pixelBuffer[p + 2];
        rgba_buffer[o + 3] = 255;
    }
    ctx.putImageData(image_data, 0, 0);

    needs_render = false;
    is_render_scheduled = false;
}

function scheduleRenderToSurface() {
    needs_render = true;
    if (is_render_scheduled) return;
    is_render_scheduled = true;
    requestAnimationFrame(renderToSurfaceIfNeeded);
}

function cep_eval_script(script, cb) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === "function") {
        window.__adobe_cep__.evalScript(script, cb);
        return;
    }
    console.warn("[palette][cep] __adobe_cep__ not available; running in mock mode");
    if (typeof cb === "function") cb("");
}

function ps_get_foreground_rgb(cb) {
    const script = [
        "var c = app.foregroundColor.rgb;",
        "'{\"r\":' + Math.round(c.red) + ',\"g\":' + Math.round(c.green) + ',\"b\":' + Math.round(c.blue) + '}'"
    ].join("\n");

    cep_eval_script(script, function (result) {
        try {
            const rgb = JSON.parse(result);
            cb(rgb);
        } catch (err) {
            console.warn("[palette][cep] read foreground failed:", err, "raw:", result);
            cb(null);
        }
    });
}

function ps_set_foreground_rgb(rgb, cb) {
    const r = Math.round(rgb.r);
    const g = Math.round(rgb.g);
    const b = Math.round(rgb.b);
    const script = [
        "var c = new SolidColor();",
        "c.rgb.red = " + r + ";",
        "c.rgb.green = " + g + ";",
        "c.rgb.blue = " + b + ";",
        "app.foregroundColor = c;",
        "'OK'"
    ].join("\n");

    cep_eval_script(script, function (result) {
        if (typeof cb === "function") cb(result);
    });
}

function getPixel(x, y) {
    const px = Math.max(0, Math.min(W - 1, Math.round(x)));
    const py = Math.max(0, Math.min(H - 1, Math.round(y)));
    const idx = (py * W + px) * 3;
    return { r: pixelBuffer[idx], g: pixelBuffer[idx + 1], b: pixelBuffer[idx + 2] };
}

// RGB 模式：简单 alpha-blend
function updatePixelBufferRGB(cx, cy, radius, rgb) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(W, Math.ceil(cx + radius));
    const y1 = Math.min(H, Math.ceil(cy + radius));
    const a = brushOpacity;
    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            const dx = px - cx, dy = py - cy;
            if (dx * dx + dy * dy >= radius * radius) continue;
            latent_dirty[py * W + px] = 1;
            const idx = (py * W + px) * 3;
            pixelBuffer[idx] = Math.round((1 - a) * pixelBuffer[idx] + a * rgb.r);
            pixelBuffer[idx + 1] = Math.round((1 - a) * pixelBuffer[idx + 1] + a * rgb.g);
            pixelBuffer[idx + 2] = Math.round((1 - a) * pixelBuffer[idx + 2] + a * rgb.b);
        }
    }
}

// Mixbox 模式：在 latent space 混合，然后转回 RGB
function updatePixelBufferMixbox(cx, cy, radius, rgb) {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(W, Math.ceil(cx + radius));
    const y1 = Math.min(H, Math.ceil(cy + radius));
    const a = brushOpacity;
    const brushLatent = mixbox.rgbToLatent([rgb.r, rgb.g, rgb.b]);
    if (!latent_tmp) latent_tmp = new Array(LATENT_SIZE);

    for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
            const dx = px - cx, dy = py - cy;
            if (dx * dx + dy * dy >= radius * radius) continue;

            const p = py * W + px;
            const li = p * LATENT_SIZE;
            const ri = p * 3;
            if (latent_dirty[p]) {
                const baseLatent = mixbox.rgbToLatent([pixelBuffer[ri], pixelBuffer[ri + 1], pixelBuffer[ri + 2]]);
                for (let j = 0; j < LATENT_SIZE; j++) {
                    latentBuffer[li + j] = baseLatent[j];
                }
                latent_dirty[p] = 0;
            }
            // latent-space 线性插值
            for (let j = 0; j < LATENT_SIZE; j++) {
                latentBuffer[li + j] = (1 - a) * latentBuffer[li + j] + a * brushLatent[j];
            }
            // 转回 RGB
            for (let j = 0; j < LATENT_SIZE; j++) {
                latent_tmp[j] = latentBuffer[li + j];
            }
            const result = mixbox.latentToRgb(latent_tmp);
            pixelBuffer[ri] = result[0];
            pixelBuffer[ri + 1] = result[1];
            pixelBuffer[ri + 2] = result[2];
        }
    }
}

function isPickMode(e) {
    return pickMode || (e && e.altKey);
}

function onPointerDown(e) {
    console.log("[palette][cep] POINTERDOWN altKey=" + e.altKey + " pickMode=" + pickMode);
    isDrawing = true;
    lastX = null;
    lastY = null;
    const pos = getPos(e);

    if (isPickMode(e)) {
        doPickColor(pos.x, pos.y);
        return;
    }

    // 读前景色（CEP 通过 ExtendScript 异步取值）
    ps_get_foreground_rgb(function (rgb) {
        if (!rgb) return;
        brushColor = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
        updateSwatch(brushColor.r, brushColor.g, brushColor.b);
        setStatus("Paint: rgb(" + brushColor.r + "," + brushColor.g + "," + brushColor.b + ")");
        if (isDrawing) drawStamp(pos.x, pos.y);
    });
}

function onPointerMove(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    if (isPickMode(e)) {
        doPickColor(pos.x, pos.y);
    } else {
        drawStrokeTo(pos.x, pos.y);
    }
}

function onPointerUp() {
    isDrawing = false;
    lastX = null;
    lastY = null;
}

function doPickColor(x, y) {
    const rgb = getPixel(x, y);
    console.log("[palette][cep] PICK rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")");
    ps_set_foreground_rgb(rgb);
    updateSwatch(rgb.r, rgb.g, rgb.b);
    setStatus("Picked: rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")");
}

function getPos(e) {
    const rect = surface_el.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function drawStamp(cx, cy) {
    if (colorMode === "mixbox") updatePixelBufferMixbox(cx, cy, brushRadius, brushColor);
    else updatePixelBufferRGB(cx, cy, brushRadius, brushColor);
    scheduleRenderToSurface();
}

function drawStrokeTo(x, y) {
    if (lastX === null) {
        drawStamp(x, y);
        lastX = x;
        lastY = y;
        return;
    }
    const dx = x - lastX;
    const dy = y - lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spacing = Math.max(2, brushRadius * 0.3);
    if (dist < spacing) return;

    const steps = Math.ceil(dist / spacing);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        drawStamp(lastX + dx * t, lastY + dy * t);
    }
    lastX = x;
    lastY = y;
}

function doClear() {
    console.log("[palette][cep] Clear clicked");
    initBuffers();
    scheduleRenderToSurface();
    setStatus("Cleared (" + colorMode + ")");
}

function updateSwatch(r, g, b) {
    const el = document.getElementById("fg-swatch");
    if (el) el.style.backgroundColor = "rgb(" + r + "," + g + "," + b + ")";
}

function setStatus(msg) {
    const el = document.getElementById("status-text");
    if (el) el.textContent = msg;
}

function doInit() {
    console.log("[palette][cep] doInit called");
    surface_el = document.getElementById("palette-surface");
    if (!surface_el) {
        console.error("[palette][cep] palette surface element NOT found!");
        return;
    }
    ctx = surface_el.getContext("2d");
    if (!ctx) {
        console.error("[palette][cep] canvas 2d context NOT available!");
        setStatus("ERROR: canvas not available");
        return;
    }
    image_data = ctx.createImageData(W, H);
    rgba_buffer = image_data.data;

    // 绑定 pointer 事件
    surface_el.addEventListener("pointerdown", onPointerDown);
    surface_el.addEventListener("pointermove", onPointerMove);
    surface_el.addEventListener("pointerup", onPointerUp);
    surface_el.addEventListener("pointerleave", onPointerUp);
    console.log("[palette][cep] pointer events bound");

    // 混色模式切换
    const modeEl = document.getElementById("select-mode");
    if (modeEl) {
        modeEl.addEventListener("change", function (e) {
            colorMode = e.target.value;
            console.log("[palette][cep] colorMode =", colorMode);
            setStatus("Mode: " + colorMode);
        });
    }

    // 工具栏
    const sizeEl = document.getElementById("slider-size");
    const opacityEl = document.getElementById("slider-opacity");
    const clearEl = document.getElementById("btn-clear");
    if (sizeEl) sizeEl.addEventListener("input", function (e) { brushRadius = parseInt(e.target.value, 10); });
    if (opacityEl) opacityEl.addEventListener("input", function (e) { brushOpacity = parseInt(e.target.value, 10) / 100; });
    if (clearEl) clearEl.addEventListener("click", doClear);

    // 吸色模式切换按钮
    const pickBtn = document.getElementById("btn-pick");
    if (pickBtn) {
        pickBtn.addEventListener("click", function () {
            pickMode = !pickMode;
            pickBtn.textContent = pickMode ? "Pick ✓" : "Pick";
            setStatus(pickMode ? "Pick mode ON (click canvas to pick)" : "Paint mode");
            console.log("[palette][cep] pickMode =", pickMode);
        });
    }

    initBuffers();
    scheduleRenderToSurface();

    // 初始化读一次前景色（失败则保持默认黑色）
    ps_get_foreground_rgb(function (rgb) {
        if (!rgb) return;
        updateSwatch(rgb.r, rgb.g, rgb.b);
    });

    initialized = true;
    setStatus("Ready (" + colorMode + ")");
    console.log("[palette][cep] init complete, mixbox loaded:", (mixbox && typeof mixbox.lerp === "function"));
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("[palette][cep] DOMContentLoaded");
    if (!initialized) doInit();
});

