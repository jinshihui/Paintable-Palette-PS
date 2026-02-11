const { entrypoints } = require("uxp");
const ps = require("photoshop");
const app = ps.app;
const { executeAsModal } = ps.core;
var mixbox = require("./lib/mixbox");

let surface_el;
let initialized = false;
let isDrawing = false;
let brushRadius = 20;
let brushOpacity = 0.6;
let brushColor = { r: 0, g: 0, b: 0 };
let pickMode = false;
let colorMode = "rgb"; // "rgb" or "mixbox"
let lastX = null, lastY = null;

const BG_R = 232, BG_G = 232, BG_B = 232;
const W = 300, H = 300;

// --- Buffer 系统 ---
// pixelBuffer: RGB 值，用于吸色和 RGB 模式混色
// latentBuffer: Mixbox latent[7] 值，用于 Mixbox 模式混色
var pixelBuffer = null;
var latentBuffer = null;
var LATENT_SIZE = 7;  // mixbox latent 维度

let rgb_array_buffer = null;
let rgb_buffer = null;
let last_object_url = null;
let is_render_scheduled = false;
let needs_render = false;
let last_render_ms = 0;
const MIN_RENDER_INTERVAL_MS = 33;
var latent_tmp = null;
let has_render_error = false;

function initBuffers() {
    pixelBuffer = new Uint8Array(W * H * 3);
    latentBuffer = new Float64Array(W * H * LATENT_SIZE);
    var bgLatent = mixbox.rgbToLatent([BG_R, BG_G, BG_B]);
    for (var i = 0; i < W * H; i++) {
        pixelBuffer[i * 3] = BG_R;
        pixelBuffer[i * 3 + 1] = BG_G;
        pixelBuffer[i * 3 + 2] = BG_B;
        for (var j = 0; j < LATENT_SIZE; j++) {
            latentBuffer[i * LATENT_SIZE + j] = bgLatent[j];
        }
    }
    console.log("[palette] buffers initialized (RGB + Latent)");
}

function renderToSurfaceIfNeeded() {
    if (!needs_render) {
        is_render_scheduled = false;
        return;
    }
    if (has_render_error) {
        needs_render = false;
        is_render_scheduled = false;
        return;
    }

    var now = Date.now();
    if (now - last_render_ms < MIN_RENDER_INTERVAL_MS) {
        requestAnimationFrame(renderToSurfaceIfNeeded);
        return;
    }
    last_render_ms = now;

    if (!rgb_array_buffer) rgb_array_buffer = new ArrayBuffer(W * H * 3);
    if (!rgb_buffer) rgb_buffer = new Uint8Array(rgb_array_buffer);
    rgb_buffer.set(pixelBuffer);

    try {
        var blob = new ImageBlob(rgb_buffer, {
            type: "image/uncompressed",
            width: W,
            height: H,
            colorSpace: "RGB",
            colorProfile: "",
            pixelFormat: "RGB",
            components: 3,
            componentSize: 8,
            hasAlpha: false
        });

        var object_url = URL.createObjectURL(blob);
        surface_el.src = object_url;
        if (last_object_url) URL.revokeObjectURL(last_object_url);
        last_object_url = object_url;
    } catch (err) {
        has_render_error = true;
        console.error("[palette] render ImageBlob failed:", err);
        console.error("[palette] ImageBlob input typeof:", typeof rgb_array_buffer, "isArrayBuffer:", (rgb_array_buffer instanceof ArrayBuffer));
        setStatus("ERROR: render failed (see console)");
    }

    needs_render = false;
    is_render_scheduled = false;
}

function scheduleRenderToSurface() {
    needs_render = true;
    if (is_render_scheduled) return;
    is_render_scheduled = true;
    requestAnimationFrame(renderToSurfaceIfNeeded);
}

function getPixel(x, y) {
    var px = Math.max(0, Math.min(W - 1, Math.round(x)));
    var py = Math.max(0, Math.min(H - 1, Math.round(y)));
    var idx = (py * W + px) * 3;
    return { r: pixelBuffer[idx], g: pixelBuffer[idx + 1], b: pixelBuffer[idx + 2] };
}

// RGB 模式：简单 alpha-blend
function updatePixelBufferRGB(cx, cy, radius, rgb) {
    var x0 = Math.max(0, Math.floor(cx - radius));
    var y0 = Math.max(0, Math.floor(cy - radius));
    var x1 = Math.min(W, Math.ceil(cx + radius));
    var y1 = Math.min(H, Math.ceil(cy + radius));
    var a = brushOpacity;
    for (var py = y0; py < y1; py++) {
        for (var px = x0; px < x1; px++) {
            var dx = px - cx, dy = py - cy;
            if (dx * dx + dy * dy >= radius * radius) continue;
            var idx = (py * W + px) * 3;
            pixelBuffer[idx] = Math.round((1 - a) * pixelBuffer[idx] + a * rgb.r);
            pixelBuffer[idx + 1] = Math.round((1 - a) * pixelBuffer[idx + 1] + a * rgb.g);
            pixelBuffer[idx + 2] = Math.round((1 - a) * pixelBuffer[idx + 2] + a * rgb.b);
        }
    }
}

// Mixbox 模式：在 latent space 混合，然后转回 RGB
function updatePixelBufferMixbox(cx, cy, radius, rgb) {
    var x0 = Math.max(0, Math.floor(cx - radius));
    var y0 = Math.max(0, Math.floor(cy - radius));
    var x1 = Math.min(W, Math.ceil(cx + radius));
    var y1 = Math.min(H, Math.ceil(cy + radius));
    var a = brushOpacity;
    var brushLatent = mixbox.rgbToLatent([rgb.r, rgb.g, rgb.b]);
    if (!latent_tmp) latent_tmp = new Array(LATENT_SIZE);

    for (var py = y0; py < y1; py++) {
        for (var px = x0; px < x1; px++) {
            var dx = px - cx, dy = py - cy;
            if (dx * dx + dy * dy >= radius * radius) continue;

            var li = (py * W + px) * LATENT_SIZE;
            // latent-space 线性插值
            for (var j = 0; j < LATENT_SIZE; j++) {
                latentBuffer[li + j] = (1 - a) * latentBuffer[li + j] + a * brushLatent[j];
            }
            // 转回 RGB
            for (var j = 0; j < LATENT_SIZE; j++) {
                latent_tmp[j] = latentBuffer[li + j];
            }
            var result = mixbox.latentToRgb(latent_tmp);
            var ri = (py * W + px) * 3;
            pixelBuffer[ri] = result[0];
            pixelBuffer[ri + 1] = result[1];
            pixelBuffer[ri + 2] = result[2];
        }
    }
}

entrypoints.setup({
    plugin: {
        create: function () { console.log("[palette] plugin create"); },
        destroy: function () {
            console.log("[palette] plugin destroy");
            if (last_object_url) URL.revokeObjectURL(last_object_url);
            last_object_url = null;
        }
    },
    panels: {
        main: {
            show: function () {
                console.log("[palette] panel show fired");
                if (!initialized) doInit();
            }
        }
    }
});

function doInit() {
    console.log("[palette] doInit called");
    surface_el = document.getElementById("palette-surface");
    if (!surface_el) {
        console.error("[palette] palette surface element NOT found!");
        return;
    }
    if (typeof ImageBlob !== "function" || !URL || typeof URL.createObjectURL !== "function") {
        console.error("[palette] ImageBlob/URL.createObjectURL not available in this UXP environment");
        setStatus("ERROR: ImageBlob not available");
        return;
    }
    console.log("[palette] surface found, w=" + W + " h=" + H);

    // 绑定 pointer 事件
    surface_el.addEventListener("pointerdown", onPointerDown);
    surface_el.addEventListener("pointermove", onPointerMove);
    surface_el.addEventListener("pointerup", onPointerUp);
    surface_el.addEventListener("pointerleave", onPointerUp);
    console.log("[palette] pointer events bound");

    // 混色模式切换
    var modeEl = document.getElementById("select-mode");
    if (modeEl) {
        modeEl.addEventListener("change", function (e) {
            colorMode = e.target.value;
            console.log("[palette] colorMode =", colorMode);
            setStatus("Mode: " + colorMode);
        });
    }

    // 工具栏
    var sizeEl = document.getElementById("slider-size");
    var opacityEl = document.getElementById("slider-opacity");
    var clearEl = document.getElementById("btn-clear");
    if (sizeEl) sizeEl.addEventListener("input", function (e) { brushRadius = parseInt(e.target.value, 10); });
    if (opacityEl) opacityEl.addEventListener("input", function (e) { brushOpacity = parseInt(e.target.value, 10) / 100; });
    if (clearEl) clearEl.addEventListener("click", doClear);

    // 吸色模式切换按钮
    var pickBtn = document.getElementById("btn-pick");
    if (pickBtn) {
        pickBtn.addEventListener("click", function () {
            pickMode = !pickMode;
            pickBtn.textContent = pickMode ? "Pick ✓" : "Pick";
            setStatus(pickMode ? "Pick mode ON (click canvas to pick)" : "Paint mode");
            console.log("[palette] pickMode =", pickMode);
        });
    }

    // 读前景色到色块
    try {
        var fg = app.foregroundColor;
        var r = Math.round(fg.rgb.red);
        var g = Math.round(fg.rgb.green);
        var b = Math.round(fg.rgb.blue);
        console.log("[palette] PS foreground: rgb(" + r + "," + g + "," + b + ")");
        updateSwatch(r, g, b);
    } catch (err) {
        console.error("[palette] read foreground failed:", err);
    }

    initBuffers();
    has_render_error = false;
    scheduleRenderToSurface();
    initialized = true;
    setStatus("Ready (" + colorMode + ")");
    console.log("[palette] init complete, mixbox loaded:", typeof mixbox.lerp === "function");
}

function isPickMode(e) {
    // e.altKey 读 pointer 事件的修饰键（绕过 PS 拦截 keydown）
    return pickMode || (e && e.altKey);
}

function onPointerDown(e) {
    console.log("[palette] POINTERDOWN altKey=" + e.altKey + " pickMode=" + pickMode);
    isDrawing = true;
    lastX = null;
    lastY = null;
    var pos = getPos(e);

    if (isPickMode(e)) {
        doPickColor(pos.x, pos.y);
    } else {
        // 读前景色
        try {
            var fg = app.foregroundColor;
            brushColor = { r: Math.round(fg.rgb.red), g: Math.round(fg.rgb.green), b: Math.round(fg.rgb.blue) };
            updateSwatch(brushColor.r, brushColor.g, brushColor.b);
        } catch (err) {
            console.warn("[palette] read fg failed:", err);
        }
        setStatus("Paint: rgb(" + brushColor.r + "," + brushColor.g + "," + brushColor.b + ")");
        drawStamp(pos.x, pos.y);
    }
}

function onPointerMove(e) {
    if (!isDrawing) return;
    var pos = getPos(e);
    if (isPickMode(e)) {
        doPickColor(pos.x, pos.y);
    } else {
        drawStrokeTo(pos.x, pos.y);
    }
}

function doPickColor(x, y) {
    var rgb = getPixel(x, y);
    console.log("[palette] PICK rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")");
    // 写入 PS 前景色必须在 modal scope 内
    executeAsModal(function () {
        var c = new app.SolidColor();
        c.rgb.red = rgb.r;
        c.rgb.green = rgb.g;
        c.rgb.blue = rgb.b;
        app.foregroundColor = c;
        console.log("[palette] foreground set OK");
    }, { commandName: "Set Foreground Color" }).catch(function (err) {
        console.warn("[palette] setForeground failed:", err);
    });
    updateSwatch(rgb.r, rgb.g, rgb.b);
    setStatus("Picked: rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")");
}

function onPointerUp() {
    isDrawing = false;
    lastX = null;
    lastY = null;
}

function getPos(e) {
    var rect = surface_el.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
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
    var dx = x - lastX;
    var dy = y - lastY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var spacing = Math.max(2, brushRadius * 0.3);
    if (dist < spacing) return;

    var steps = Math.ceil(dist / spacing);
    for (var i = 1; i <= steps; i++) {
        var t = i / steps;
        drawStamp(lastX + dx * t, lastY + dy * t);
    }
    lastX = x;
    lastY = y;
}

function doClear() {
    console.log("[palette] Clear clicked");
    initBuffers();
    has_render_error = false;
    scheduleRenderToSurface();
    setStatus("Cleared (" + colorMode + ")");
}

function updateSwatch(r, g, b) {
    var el = document.getElementById("fg-swatch");
    if (el) el.style.backgroundColor = "rgb(" + r + "," + g + "," + b + ")";
}

function setStatus(msg) {
    var el = document.getElementById("status-text");
    if (el) el.textContent = msg;
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("[palette] DOMContentLoaded");
    if (!initialized) doInit();
});
