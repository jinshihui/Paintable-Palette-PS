module.exports = [
    {
        files: ["src/**/*.js", "lib/**/*.js"],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "script",
            globals: {
                require: "readonly",
                console: "readonly",
                ImageBlob: "readonly",
                URL: "readonly",
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
