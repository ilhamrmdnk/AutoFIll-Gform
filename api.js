const extAPI = typeof browser !== "undefined"
    ? browser
    : chrome;

window.extAPI = extAPI;