const { entrypoints } = require("uxp");
const app = require("photoshop").app;
const SolidColor = require("photoshop").app.SolidColor;

// ── State ────────────────────────────────────────────────────────
let canvas, ctx;
let brushRadius = 20;
let brushOpacity = 0.6;   // 0-1
let brushHardness = 0.5;  // 0-1
let brushColor = { r: 0, g: 0, b: 0 };
let isDrawing = false;
let isAltDown = false;
let lastX = null, lastY = null;
const BG_COLOR = { r: 232, g: 232, b: 232 };

// ── UXP entrypoints ─────────────────────────────────────────────
entrypoints.setup({
    plugin: {
        create() { console.log("Plugin created"); },
        destroy() { console.log("Plugin destroyed"); }
    },
    panels: {
        main: {
            create() { console.log("Panel created"); },
            show() { initCanvas(); },
            hide() { },
            destroy() { }
        }
    }
});

// ── Color Bridge (PS ↔ Panel) ───────────────────────────────────
function getForegroundRGB() {
    try {
        const fg = app.foregroundColor;
        return { r: Math.round(fg.rgb.red), g: Math.round(fg.rgb.green), b: Math.round(fg.rgb.blue) };
    } catch (e) {
        console.warn("getForegroundRGB failed:", e);
        return { r: 0, g: 0, b: 0 };
    }
}

function setForegroundRGB(rgb) {
    try {
        const c = new SolidColor();
        c.rgb.red = rgb.r;
        c.rgb.green = rgb.g;
        c.rgb.blue = rgb.b;
        app.foregroundColor = c;
    } catch (e) {
        console.warn("setForegroundRGB failed:", e);
    }
}

// ── Brush helpers ───────────────────────────────────────────────
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function stampAt(cx, cy) {
    const r = brushRadius;
    // bbox 裁剪到 canvas 范围
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(canvas.width, Math.ceil(cx + r));
    const y1 = Math.min(canvas.height, Math.ceil(cy + r));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;

    const imgData = ctx.getImageData(x0, y0, w, h);
    const data = imgData.data;
    const hardRadius = r * brushHardness;

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const dx = (x0 + px) - cx;
            const dy = (y0 + py) - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= r) continue;

            // coverage: 1.0 在硬边内，smoothstep 过渡到 0
            let coverage;
            if (dist <= hardRadius) {
                coverage = 1.0;
            } else {
                coverage = 1.0 - smoothstep(hardRadius, r, dist);
            }
            const a = brushOpacity * coverage;
            if (a <= 0) continue;

            const idx = (py * w + px) * 4;
            // RGB alpha blend: dst = (1-a)*dst + a*src
            data[idx] = Math.round((1 - a) * data[idx] + a * brushColor.r);
            data[idx + 1] = Math.round((1 - a) * data[idx + 1] + a * brushColor.g);
            data[idx + 2] = Math.round((1 - a) * data[idx + 2] + a * brushColor.b);
            // alpha 通道保持 255
        }
    }
    ctx.putImageData(imgData, x0, y0);
}

function strokeTo(x, y) {
    if (lastX === null) {
        stampAt(x, y);
        lastX = x;
        lastY = y;
        return;
    }
    const dx = x - lastX;
    const dy = y - lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const spacing = brushRadius * 0.35;
    if (dist < spacing) return;

    const steps = Math.ceil(dist / spacing);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stampAt(lastX + dx * t, lastY + dy * t);
    }
    lastX = x;
    lastY = y;
}

function pickColorAt(x, y) {
    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    const imgData = ctx.getImageData(px, py, 1, 1);
    const rgb = { r: imgData.data[0], g: imgData.data[1], b: imgData.data[2] };
    setForegroundRGB(rgb);
    updateSwatchUI(rgb);
    setStatus("Picked: rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")");
}

// ── UI helpers ──────────────────────────────────────────────────
function updateSwatchUI(rgb) {
    const swatch = document.getElementById("fg-swatch");
    if (swatch) swatch.style.backgroundColor = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
}

function setStatus(msg) {
    const el = document.getElementById("status-text");
    if (el) el.textContent = msg;
}

function clearCanvas() {
    ctx.fillStyle = "rgb(" + BG_COLOR.r + "," + BG_COLOR.g + "," + BG_COLOR.b + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setStatus("Cleared");
}

// ── Canvas 坐标转换 ─────────────────────────────────────────────
function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    // canvas 显示尺寸可能与内部像素尺寸不同，需要缩放
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

// ── Init ────────────────────────────────────────────────────────
function initCanvas() {
    canvas = document.getElementById("palette-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    clearCanvas();

    // 工具栏事件
    document.getElementById("slider-size").addEventListener("input", (e) => {
        brushRadius = parseInt(e.target.value, 10);
    });
    document.getElementById("slider-opacity").addEventListener("input", (e) => {
        brushOpacity = parseInt(e.target.value, 10) / 100;
    });
    document.getElementById("slider-hardness").addEventListener("input", (e) => {
        brushHardness = parseInt(e.target.value, 10) / 100;
    });
    document.getElementById("btn-clear").addEventListener("click", clearCanvas);

    // Alt 键追踪
    document.addEventListener("keydown", (e) => {
        if (e.key === "Alt") isAltDown = true;
    });
    document.addEventListener("keyup", (e) => {
        if (e.key === "Alt") isAltDown = false;
    });

    // Pointer 事件
    canvas.addEventListener("pointerdown", (e) => {
        isDrawing = true;
        lastX = null;
        lastY = null;
        const pos = canvasCoords(e);

        if (isAltDown) {
            pickColorAt(pos.x, pos.y);
        } else {
            // 按下时读取 PS 前景色
            brushColor = getForegroundRGB();
            updateSwatchUI(brushColor);
            setStatus("Painting: rgb(" + brushColor.r + "," + brushColor.g + "," + brushColor.b + ")");
            strokeTo(pos.x, pos.y);
        }
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!isDrawing) return;
        const pos = canvasCoords(e);

        if (isAltDown) {
            pickColorAt(pos.x, pos.y);
        } else {
            strokeTo(pos.x, pos.y);
        }
    });

    canvas.addEventListener("pointerup", () => {
        isDrawing = false;
        lastX = null;
        lastY = null;
    });

    canvas.addEventListener("pointerleave", () => {
        isDrawing = false;
        lastX = null;
        lastY = null;
    });

    // 初始化 swatch 显示
    const fg = getForegroundRGB();
    updateSwatchUI(fg);
    setStatus("Ready");
    console.log("Palette canvas initialized (Phase 1)");
}

// 兜底：如果 show 生命周期没触发，DOMContentLoaded 时也尝试初始化
document.addEventListener("DOMContentLoaded", () => {
    if (!canvas) initCanvas();
});
