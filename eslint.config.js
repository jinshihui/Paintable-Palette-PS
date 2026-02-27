module.exports = [
    {
        files: ["cep_ext/com.jinshihui.paintablepalette/js/**/*.js", "lib/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "script",
            globals: {
                require: "readonly",
                console: "readonly",
                requestAnimationFrame: "readonly",
                document: "readonly",
                window: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off"
        }
    }
];
