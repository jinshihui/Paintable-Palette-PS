const { entrypoints } = require("uxp");
const app = require("photoshop").app;
const SolidColor = require("photoshop").app.SolidColor;

let canvas, ctx;
let initialized = false;
let isDrawing = false;
let brushRadius = 20;
let brushOpacity = 0.6;
let brushColor = { r: 0, g: 0, b: 0 };
let lastX = null, lastY = null;

const BG_R = 232, BG_G = 232, BG_B = 232;

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

    // 测试绘图：画一个红色圆
    ctx.fillStyle = "rgb(255,0,0)";
    ctx.beginPath();
    ctx.arc(150, 150, 30, 0, Math.PI * 2);
    ctx.fill();
    console.log("[palette] test red circle drawn at center");

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

    // Alt 键
    document.addEventListener("keydown", function (e) {
        if (e.key === "Alt" || e.keyCode === 18) {
            console.log("[palette] Alt DOWN");
        }
    });

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

    initialized = true;
    setStatus("Ready - test circle should be visible");
    console.log("[palette] init complete");
}

function onPointerDown(e) {
    console.log("[palette] POINTERDOWN clientX=" + e.clientX + " clientY=" + e.clientY);
    isDrawing = true;
    lastX = null;
    lastY = null;

    // 读前景色
    try {
        var fg = app.foregroundColor;
        brushColor = { r: Math.round(fg.rgb.red), g: Math.round(fg.rgb.green), b: Math.round(fg.rgb.blue) };
        updateSwatch(brushColor.r, brushColor.g, brushColor.b);
    } catch (err) {
        console.warn("[palette] read fg failed in pointerdown:", err);
    }

    var pos = getPos(e);
    console.log("[palette] canvas pos: x=" + pos.x + " y=" + pos.y);
    drawStamp(pos.x, pos.y);
}

function onPointerMove(e) {
    if (!isDrawing) return;
    var pos = getPos(e);
    drawStrokeTo(pos.x, pos.y);
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
