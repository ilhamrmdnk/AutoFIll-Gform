const storageAPI = (typeof chrome !== "undefined" && chrome.storage)
    ? chrome.storage.local
    : (typeof browser !== "undefined" && browser.storage ? browser.storage.local : null);

async function saveData(responses, currentIndex) {
    if (storageAPI) {
        await storageAPI.set({
            responses,
            currentIndex
        });
    }
}

async function loadData() {
    if (storageAPI) {
        const data = await storageAPI.get([
            "responses",
            "currentIndex"
        ]);

        return {
            responses: data.responses || [],
            currentIndex: data.currentIndex || 0
        };
    }
    return {
        responses: [],
        currentIndex: 0
    };
}

window.saveData = saveData;
window.loadData = loadData;