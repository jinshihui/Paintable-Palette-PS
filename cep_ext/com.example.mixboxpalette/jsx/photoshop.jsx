function mixboxpalette_getForegroundRGB() {
    try {
        var c = app.foregroundColor;
        var r = Math.round(c.rgb.red);
        var g = Math.round(c.rgb.green);
        var b = Math.round(c.rgb.blue);
        return '{"r":' + r + ',"g":' + g + ',"b":' + b + '}';
    } catch (e) {
        return '';
    }
}

function mixboxpalette_setForegroundRGB(r, g, b) {
    var c = new SolidColor();
    c.rgb.red = r;
    c.rgb.green = g;
    c.rgb.blue = b;
    app.foregroundColor = c;
    return 'OK';
}

