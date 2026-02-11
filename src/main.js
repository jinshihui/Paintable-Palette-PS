const { entrypoints } = require("uxp");
const ps = require("photoshop");
const app = ps.app;
const { executeAsModal } = ps.core;

let canvas, ctx;
let initialized = false;
let isDrawing = false;
let brushRadius = 20;
let brushOpacity = 0.6;
let brushColor = { r: 0, g: 0, b: 0 };
let pickMode = false;
let lastX = null, lastY = null;

const BG_R = 232, BG_G = 232, BG_B = 232;
const W = 300, H = 300;

// pixelBuffer 追踪画布颜色（UXP 不支持 getImageData）
var pixelBuffer = null;

function initPixelBuffer() {
    pixelBuffer = new Uint8Array(W * H * 3);
    for (var i = 0; i < W * H; i++) {
        pixelBuffer[i * 3] = BG_R;
        pixelBuffer[i * 3 + 1] = BG_G;
        pixelBuffer[i * 3 + 2] = BG_B;
    }
}

function getPixel(x, y) {
    var px = Math.max(0, Math.min(W - 1, Math.round(x)));
    var py = Math.max(0, Math.min(H - 1, Math.round(y)));
    var idx = (py * W + px) * 3;
    return { r: pixelBuffer[idx], g: pixelBuffer[idx + 1], b: pixelBuffer[idx + 2] };
}

function updatePixelBuffer(cx, cy, radius, rgb) {
    var x0 = Math.max(0, Math.floor(cx - radius));
    var y0 = Math.max(0, Math.floor(cy - radius));
    var x1 = Math.min(W, Math.ceil(cx + radius));
    var y1 = Math.min(H, Math.ceil(cy + radius));
    for (var py = y0; py < y1; py++) {
        for (var px = x0; px < x1; px++) {
            var dx = px - cx, dy = py - cy;
            if (dx * dx + dy * dy >= radius * radius) continue;
            var a = brushOpacity;
            var idx = (py * W + px) * 3;
            pixelBuffer[idx] = Math.round((1 - a) * pixelBuffer[idx] + a * rgb.r);
            pixelBuffer[idx + 1] = Math.round((1 - a) * pixelBuffer[idx + 1] + a * rgb.g);
            pixelBuffer[idx + 2] = Math.round((1 - a) * pixelBuffer[idx + 2] + a * rgb.b);
        }
    }
}

entrypoints.setup({
    plugin: {
        create: function () { console.log("[palette] plugin create"); },
        destroy: function () { console.log("[palette] plugin destroy"); }
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
    canvas = document.getElementById("palette-canvas");
    if (!canvas) {
        console.error("[palette] canvas element NOT found!");
        return;
    }
    console.log("[palette] canvas found, w=" + canvas.width + " h=" + canvas.height);

    ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error("[palette] getContext('2d') returned null!");
        return;
    }
    console.log("[palette] 2d context OK");

    // 初始化底色
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "rgb(232,232,232)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    console.log("[palette] fillRect done (bg)");

    // 绑定 pointer 事件
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);
    console.log("[palette] pointer events bound");

    // 也尝试 click 事件看能不能触发
    canvas.addEventListener("click", function (e) {
        console.log("[palette] CLICK on canvas, clientX=" + e.clientX + " clientY=" + e.clientY);
    });

    // 工具栏
    var sizeEl = document.getElementById("slider-size");
    var opacityEl = document.getElementById("slider-opacity");
    var hardnessEl = document.getElementById("slider-hardness");
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

    initPixelBuffer();
    initialized = true;
    setStatus("Ready");
    console.log("[palette] init complete");
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
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function drawStamp(cx, cy) {
    ctx.globalAlpha = brushOpacity;
    ctx.fillStyle = "rgb(" + brushColor.r + "," + brushColor.g + "," + brushColor.b + ")";
    ctx.beginPath();
    ctx.arc(cx, cy, brushRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    // 同步到 pixelBuffer
    updatePixelBuffer(cx, cy, brushRadius, brushColor);
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
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "rgb(232,232,232)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    initPixelBuffer();
    setStatus("Cleared");
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
