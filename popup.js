let responses = [];
let currentIndex = 0;

const input = document.getElementById("responsesInput");
const importBtn = document.getElementById("importBtn");
const answerView = document.getElementById("answerView");
const counter = document.getElementById("counter");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const fillBtn = document.getElementById("fillBtn");
const stopBtn = document.getElementById("stopBtn");
const deleteBtn = document.getElementById("deleteBtn");
const clearBtn = document.getElementById("clearBtn");
const donateBtn = document.getElementById("donateBtn");
const iterationDelaySelect = document.getElementById("iterationDelaySelect");
const countdownBanner = document.getElementById("countdownBanner");
const countdownTitle = document.getElementById("countdownTitle");
const countdownTimer = document.getElementById("countdownTimer");
const skipWaitBtn = document.getElementById("skipWaitBtn");

const RANDOM_DELAY_OPTIONS = [2, 4, 5, 7, 8, 10, 15];
let countdownInterval = null;

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function updateCountdownUI() {
    const state = await chrome.storage.local.get([
        "loopActive",
        "nextRunTimestamp",
        "waitingForIndex",
        "responses"
    ]);
    const total = (state.responses || []).length;
    const now = Date.now();

    if (state.loopActive && state.nextRunTimestamp && state.nextRunTimestamp > now) {
        if (countdownBanner) countdownBanner.classList.remove("hidden");
        const nextNum = (state.waitingForIndex !== undefined ? state.waitingForIndex : currentIndex) + 1;
        if (countdownTitle) {
            countdownTitle.textContent = total > 0
                ? `Menunggu Iterasi #${nextNum} / ${total}:`
                : `Menunggu iterasi berikutnya:`;
        }
        if (countdownTimer) {
            countdownTimer.textContent = formatDuration(state.nextRunTimestamp - now);
        }
    } else {
        if (countdownBanner) countdownBanner.classList.add("hidden");
    }
}

function renderCurrentAnswer() {
    if (responses.length === 0) {
        counter.textContent = "No Data";
        answerView.innerHTML = "No response data has been imported yet.";
        answerView.classList.add("empty-state");
        return;
    }

    answerView.classList.remove("empty-state");
    counter.textContent = `Answer ${currentIndex + 1} / ${responses.length}`;

    const answer = responses[currentIndex];
    let html = "";

    for (const key in answer) {
        html += `<p><strong>${key}</strong>: ${answer[key]}</p>`;
    }

    answerView.innerHTML = html;
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.currentIndex) {
        currentIndex = changes.currentIndex.newValue;
        renderCurrentAnswer();
    }
    if (area === "local" && changes.loopActive) {
        const autoSubmitCheck = document.getElementById("autoSubmitCheck");
        if (autoSubmitCheck) {
            autoSubmitCheck.checked = changes.loopActive.newValue;
        }
        updateCountdownUI();
    }
    if (area === "local" && changes.iterationDelay && iterationDelaySelect) {
        iterationDelaySelect.value = changes.iterationDelay.newValue;
    }
    if (area === "local" && changes.nextRunTimestamp) {
        updateCountdownUI();
    }
});

function parseResponses(rawText) {
    const blocks = rawText.split(/---+/).map(b => b.trim()).filter(Boolean);
    return blocks.map(block => {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const obj = {};
        for (const line of lines) {
            const separatorIdx = line.indexOf(':');
            if (separatorIdx !== -1) {
                let key = line.substring(0, separatorIdx).replace(/^[-*\s]+/, '').trim();
                let value = line.substring(separatorIdx + 1).trim();
                if (key && value) {
                    obj[key] = value;
                }
            }
        }
        return obj;
    });
}

importBtn.addEventListener("click", async () => {
    if (!input.value.trim()) {
        alert("Please paste your response data first!");
        return;
    }

    responses = parseResponses(input.value);

    if (responses.length === 0) {
        alert("Data format not recognized. Make sure to use the '---' separator.");
        return;
    }

    currentIndex = 0;
    await saveData(responses, currentIndex);
    input.value = ""; 
    renderCurrentAnswer();
});

prevBtn.addEventListener("click", async () => {
    if (responses.length === 0) return;
    if (currentIndex > 0) {
        currentIndex--;
        await saveData(responses, currentIndex);
        renderCurrentAnswer();
    }
});

nextBtn.addEventListener("click", async () => {
    if (responses.length === 0) return;
    if (currentIndex < responses.length - 1) {
        currentIndex++;
        await saveData(responses, currentIndex);
        renderCurrentAnswer();
    }
});

deleteBtn.addEventListener("click", async () => {
    if (responses.length === 0) return;
    responses.splice(currentIndex, 1);

    if (currentIndex >= responses.length) {
        currentIndex = responses.length - 1;
    }
    if (currentIndex < 0) {
        currentIndex = 0;
    }

    await saveData(responses, currentIndex);
    renderCurrentAnswer();
});

clearBtn.addEventListener("click", async () => {
    if (responses.length === 0) return;
    const confirmed = confirm("Delete all answers?");
    if (!confirmed) return;

    responses = [];
    currentIndex = 0;
    await saveData(responses, currentIndex);
    renderCurrentAnswer();
});

if (iterationDelaySelect) {
    iterationDelaySelect.addEventListener("change", async () => {
        const selectedVal = iterationDelaySelect.value;
        const state = await chrome.storage.local.get(["loopActive", "nextRunTimestamp", "waitStartedAt"]);
        const updates = { iterationDelay: selectedVal };

        // Jika sedang dalam masa tunggu iterasi berikutnya, sesuaikan sisa waktu secara langsung
        if (state.loopActive && state.nextRunTimestamp && state.nextRunTimestamp > Date.now()) {
            let minutes = 0;
            if (selectedVal === "random") {
                minutes = RANDOM_DELAY_OPTIONS[Math.floor(Math.random() * RANDOM_DELAY_OPTIONS.length)];
            } else {
                minutes = parseInt(selectedVal, 10) || 0;
            }

            if (minutes <= 0) {
                updates.skipCurrentWait = true;
                updates.nextRunTimestamp = null;
            } else {
                const baseTime = state.waitStartedAt || Date.now();
                updates.nextRunTimestamp = baseTime + minutes * 60 * 1000;
            }
        }

        await chrome.storage.local.set(updates);
        updateCountdownUI();
    });
}

if (skipWaitBtn) {
    skipWaitBtn.addEventListener("click", async () => {
        await chrome.storage.local.set({
            skipCurrentWait: true,
            nextRunTimestamp: null
        });
        updateCountdownUI();
    });
}

fillBtn.addEventListener("click", async () => {
    if (responses.length === 0) {
        alert("No answers available.");
        return;
    }

    const autoSubmitCheck = document.getElementById("autoSubmitCheck");
    const isAutoSubmitMode = autoSubmitCheck ? autoSubmitCheck.checked : false;
    const selectedDelay = iterationDelaySelect ? iterationDelaySelect.value : "2";
    
    const answer = responses[currentIndex];
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    if (!tabs.length) {
        alert("Active tab not found.");
        return;
    }

    await chrome.storage.local.set({ 
        loopActive: isAutoSubmitMode,
        currentIndex: currentIndex,
        iterationDelay: selectedDelay,
        nextRunTimestamp: null,
        skipCurrentWait: false
    });

    const activeTab = tabs[0];
    const isGFormTab = activeTab.url && activeTab.url.includes("docs.google.com/forms");

    try {
        await chrome.tabs.sendMessage(activeTab.id, {
            type: "FILL_FORM",
            data: answer
        });
    } catch (err) {
        console.error("Gagal mengirim pesan ke tab formulir:", err);
        if (!isGFormTab) {
            alert("Tab aktif saat ini bukan halaman Google Form!\n\nSilakan buka tab formulir Google Form terlebih dahulu.");
        } else {
            alert("Gagal terhubung ke script Google Form!\n\nSilakan REFRESH (F5) halaman Google Form Anda terlebih dahulu agar sistem ekstensi terhubung.");
        }
    }
});

stopBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({
        loopActive: false,
        nextRunTimestamp: null,
        skipCurrentWait: false
    });
    
    const autoSubmitCheck = document.getElementById("autoSubmitCheck");
    if (autoSubmitCheck) {
        autoSubmitCheck.checked = false;
    }
    updateCountdownUI();
    
    console.log("Automation forcefully stopped by user.");
    alert("Automation Stopped! The bot will not continue to the next data entry.");
});

donateBtn.addEventListener("click", () => {
    window.open("https://saweria.co/remdeengg", "_blank");
});

async function init() {
    const data = await loadData();
    responses = data.responses;
    currentIndex = data.currentIndex;
    renderCurrentAnswer();

    const dataStorage = await chrome.storage.local.get(["loopActive", "iterationDelay"]);
    const autoSubmitCheck = document.getElementById("autoSubmitCheck");
    if (autoSubmitCheck && dataStorage.loopActive !== undefined) {
        autoSubmitCheck.checked = dataStorage.loopActive;
    }

    if (iterationDelaySelect) {
        if (dataStorage.iterationDelay !== undefined) {
            iterationDelaySelect.value = String(dataStorage.iterationDelay);
        } else {
            await chrome.storage.local.set({ iterationDelay: iterationDelaySelect.value });
        }
    }

    await updateCountdownUI();
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(updateCountdownUI, 1000);
}

init();