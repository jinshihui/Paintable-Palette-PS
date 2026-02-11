const { entrypoints } = require("uxp");
const app = require("photoshop").app;

// Main entry point
entrypoints.setup({
    plugin: {
        create(plugin) {
            console.log("Plugin created");
        },
        destroy() {
            console.log("Plugin destroyed");
        }
    },
    panels: {
        main: {
            create(panel) {
                console.log("Panel created");
            },
            show(panel) {
                console.log("Panel shown");
            },
            hide(panel) {
                console.log("Panel hidden");
            },
            destroy(panel) {
                console.log("Panel destroyed");
            },
            invokeMenu(id) {
                console.log("Menu invoked: " + id);
            }
        }
    }
});

// Basic canvas setup (placeholder)
document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("palette-canvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#eeeeee";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        console.log("Canvas initialized");
    }
});
