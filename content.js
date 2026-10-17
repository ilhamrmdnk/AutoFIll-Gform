console.log("GForm AutoFill Content Script Loaded");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeText = (text) => (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

initAutoLoop();

/**
 * Cek apakah halaman saat ini merupakan halaman form (memiliki pertanyaan)
 */
function isFormPage() {
    const cards = document.querySelectorAll('div[role="listitem"], .Qr7Oae, .geS5n');
    return cards.length > 0;
}

/**
 * Tunggu sampai elemen form muncul di DOM
 */
async function waitForFormReady(timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (isFormPage()) {
            await delay(400);
            return true;
        }
        await delay(250);
    }
    return false;
}

/**
 * Set nilai input teks/textarea menggunakan prototype setter bawaan browser
 * agar Google Forms mendeteksi perubahan nilai dan tidak mengosongkannya kembali.
 */
function setNativeInputValue(element, value) {
    if (!element) return;
    element.focus();

    const isTextarea = element instanceof HTMLTextAreaElement || element.tagName === 'TEXTAREA';
    const prototype = isTextarea 
        ? window.HTMLTextAreaElement.prototype 
        : window.HTMLInputElement.prototype;
    
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    } else {
        element.value = value;
    }

    // Trigger event agar form closure/framework merespons
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Klik elemen UI secara natural (simulasi mouse down, up, dan native click)
 */
function selectElement(element) {
    if (!element) return;
    try {
        element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    } catch (e) {}

    element.focus();

    const mouseEventInit = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('pointerdown', mouseEventInit));
    element.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
    element.dispatchEvent(new MouseEvent('pointerup', mouseEventInit));
    element.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));

    if (typeof element.click === 'function') {
        element.click();
    } else {
        element.dispatchEvent(new MouseEvent('click', mouseEventInit));
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Ambil daftar kartu pertanyaan tanpa duplikasi wrapper
 */
function getQuestionCards() {
    let cards = Array.from(document.querySelectorAll('div[role="listitem"], .Qr7Oae'));
    if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.geS5n'));
    }
    return cards.filter(card => !cards.some(other => other !== card && other.contains(card)));
}

/**
 * Ekstrak teks judul pertanyaan dari kartu
 */
function getQuestionHeading(card) {
    const headingElem = card.querySelector('[role="heading"], .M7eMe, .HoPnJf, .F9g2ud, .freebirdFormviewerViewItemsItemItemTitle');
    if (headingElem) {
        const clone = headingElem.cloneNode(true);
        clone.querySelectorAll('*[aria-hidden="true"], .v3DuG').forEach(el => el.remove());
        return clone.textContent.trim();
    }
    return '';
}

/**
 * Mencari tautan "Kirim tanggapan lain" / "Submit another response"
 */
function findSubmitAnotherResponseLink() {
    const candidates = Array.from(document.querySelectorAll('a, [role="button"], div[role="link"]'));
    for (const el of candidates) {
        const text = (el.textContent || el.innerText || '').toLowerCase().trim();
        const href = (el.getAttribute('href') || '').toLowerCase();
        
        if (text.includes("kirim tanggapan lain") || 
            text.includes("kirim jawaban lain") || 
            text.includes("tanggapan lain") || 
            text.includes("jawaban lain") || 
            text.includes("submit another response") ||
            text.includes("another response") ||
            href.includes("viewform")) {
            return el;
        }
    }

    const containerLink = document.querySelector('.freebirdFormviewerViewResponseLinksContainer a, .c2gzEf a');
    if (containerLink) {
        return containerLink;
    }

    return null;
}

const ITERATION_DELAY_OPTIONS = [2, 4, 5, 7, 8, 10, 15];
let isHandlingConfirmation = false;

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function removeCountdownOverlay() {
    const existing = document.getElementById('gform-autofill-countdown-overlay');
    if (existing) {
        existing.remove();
    }
}

function showCountdownOverlay(nextRespondentNum, totalData, initialTimeStr) {
    removeCountdownOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'gform-autofill-countdown-overlay';
    overlay.style.cssText = [
        'position: fixed',
        'bottom: 24px',
        'right: 24px',
        'z-index: 2147483647',
        'background: #0f172a',
        'color: #f8fafc',
        'border: 1px solid #6366f1',
        'border-radius: 12px',
        'padding: 16px 18px',
        'width: 300px',
        'box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45)',
        'font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    ].join(';');

    overlay.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:700;color:#818cf8;">⏳ GForm AutoFill — Jeda Iterasi</span>
            <span style="font-size:11px;background:rgba(99,102,241,0.2);color:#a5b4fc;padding:2px 8px;border-radius:10px;font-weight:600;">
                #${nextRespondentNum} / ${totalData}
            </span>
        </div>
        <div style="font-size:12px;color:#cbd5e1;margin-bottom:10px;">
            Menunggu waktu iterasi selanjutnya dijalankan...
        </div>
        <div id="gform-autofill-timer-value" style="font-size:28px;font-weight:800;color:#f8fafc;text-align:center;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 0;margin-bottom:12px;letter-spacing:1px;font-variant-numeric:tabular-nums;">
            ${initialTimeStr}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button id="gform-autofill-skip-btn" style="background:#6366f1;color:#ffffff;border:none;border-radius:6px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;">
                Jalankan Sekarang
            </button>
            <button id="gform-autofill-stop-btn" style="background:rgba(244,63,94,0.15);color:#fda4af;border:1px solid rgba(244,63,94,0.4);border-radius:6px;padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;">
                Stop Bot
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    const skipBtn = document.getElementById('gform-autofill-skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            chrome.storage.local.set({ skipCurrentWait: true, nextRunTimestamp: null });
        });
    }

    const stopBtn = document.getElementById('gform-autofill-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            chrome.storage.local.set({ loopActive: false, nextRunTimestamp: null, skipCurrentWait: false });
        });
    }
}

function updateCountdownOverlayTimer(remainingMs) {
    const timerEl = document.getElementById('gform-autofill-timer-value');
    if (timerEl) {
        timerEl.textContent = formatCountdown(remainingMs);
    }
}

/**
 * Menunggu sesuai waktu jeda iterasi yang dipilih (2, 4, 5, 7, 8, 10, 15 menit, acak, atau 0)
 * sebelum melanjutkan ke pengisian data berikutnya.
 */
async function waitBeforeNextIteration(nextIndex, totalData) {
    const state = await chrome.storage.local.get([
        "loopActive",
        "iterationDelay",
        "nextRunTimestamp",
        "waitingForIndex"
    ]);

    if (!state.loopActive) return false;

    const now = Date.now();
    let targetTimestamp = null;

    // Gunakan kembali timer yang sedang berjalan jika halaman di-refresh di tengah waktu tunggu
    if (state.nextRunTimestamp && state.nextRunTimestamp > now && state.waitingForIndex === nextIndex) {
        targetTimestamp = state.nextRunTimestamp;
    } else {
        const rawDelay = state.iterationDelay !== undefined ? String(state.iterationDelay) : "2";
        let delayMinutes = 0;

        if (rawDelay === "random") {
            delayMinutes = ITERATION_DELAY_OPTIONS[Math.floor(Math.random() * ITERATION_DELAY_OPTIONS.length)];
        } else {
            delayMinutes = parseInt(rawDelay, 10) || 0;
        }

        if (delayMinutes <= 0) {
            await chrome.storage.local.set({
                nextRunTimestamp: null,
                waitStartedAt: null,
                skipCurrentWait: false
            });
            return true;
        }

        targetTimestamp = now + delayMinutes * 60 * 1000;
        await chrome.storage.local.set({
            nextRunTimestamp: targetTimestamp,
            waitStartedAt: now,
            waitingForIndex: nextIndex,
            skipCurrentWait: false
        });
        console.log(`[Auto-Loop] Menunggu ${delayMinutes} menit sebelum lanjut ke iterasi #${nextIndex + 1} dari ${totalData}...`);
    }

    showCountdownOverlay(nextIndex + 1, totalData, formatCountdown(targetTimestamp - Date.now()));

    while (Date.now() < targetTimestamp) {
        const current = await chrome.storage.local.get([
            "loopActive",
            "skipCurrentWait",
            "nextRunTimestamp"
        ]);

        if (!current.loopActive) {
            console.log("[Auto-Loop] Loop dihentikan saat masa tunggu iterasi.");
            removeCountdownOverlay();
            await chrome.storage.local.set({
                nextRunTimestamp: null,
                waitStartedAt: null,
                skipCurrentWait: false
            });
            return false;
        }

        if (current.skipCurrentWait) {
            console.log("[Auto-Loop] Jeda iterasi dilewati oleh pengguna, menjalankan sekarang...");
            break;
        }

        if (current.nextRunTimestamp && current.nextRunTimestamp !== targetTimestamp) {
            targetTimestamp = current.nextRunTimestamp;
        }

        const remainingMs = targetTimestamp - Date.now();
        if (remainingMs <= 0) break;

        updateCountdownOverlayTimer(remainingMs);
        await delay(500);
    }

    removeCountdownOverlay();
    await chrome.storage.local.set({
        nextRunTimestamp: null,
        waitStartedAt: null,
        skipCurrentWait: false
    });

    const finalCheck = await chrome.storage.local.get("loopActive");
    return Boolean(finalCheck.loopActive);
}

/**
 * Tunggu halaman konfirmasi sukses muncul, lalu klik "Kirim tanggapan lain"
 * untuk lanjut ke iterasi berikutnya hingga semua data selesai.
 */
async function waitForConfirmationAndContinue(currentIndex, totalData, maxWaitMs = 20000) {
    if (isHandlingConfirmation) return true;
    isHandlingConfirmation = true;

    try {
        console.log(`[Auto-Loop] Menunggu halaman konfirmasi pengiriman (Iterasi #${currentIndex + 1} dari ${totalData})...`);
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            if (!isFormPage()) {
                const link = findSubmitAnotherResponseLink();
                if (link) {
                    console.log("[Auto-Loop] Ditemukan tautan untuk tanggapan berikutnya!");
                    await delay(600);

                    if (currentIndex < totalData - 1) {
                        const nextIndex = currentIndex + 1;

                        // Tunggu sesuai jeda iterasi yang dipilih sebelum memulai responden berikutnya
                        const shouldProceed = await waitBeforeNextIteration(nextIndex, totalData);
                        if (!shouldProceed) {
                            return true;
                        }

                        // Simpan index baru di storage sebelum berpindah
                        await chrome.storage.local.set({ currentIndex: nextIndex });
                        console.log(`[Auto-Loop] Melanjutkan ke iterasi #${nextIndex + 1} dari ${totalData}`);
                        
                        await delay(400);

                        const freshLink = findSubmitAnotherResponseLink() || link;
                        const targetHref = freshLink.getAttribute('href') || freshLink.href;
                        selectElement(freshLink);
                        if (typeof freshLink.click === 'function') {
                            freshLink.click();
                        }

                        // Fallback navigasi jika klik tidak memicu reload
                        if (targetHref && targetHref.includes('viewform')) {
                            setTimeout(() => {
                                if (!isFormPage()) {
                                    window.location.href = targetHref;
                                }
                            }, 1500);
                        }

                        // Jika Google Form transisi secara SPA (tanpa reload):
                        await delay(1200);
                        const formReady = await waitForFormReady(8000);
                        if (formReady) {
                            await delay(400);
                            const storage = await chrome.storage.local.get(["responses", "loopActive"]);
                            if (storage.loopActive && storage.responses && storage.responses[nextIndex]) {
                                isHandlingConfirmation = false;
                                await runFormAutomation(storage.responses[nextIndex]);
                            }
                        }
                    } else {
                        // Semua data sudah selesai diisi!
                        await chrome.storage.local.set({
                            loopActive: false,
                            nextRunTimestamp: null,
                            waitStartedAt: null,
                            skipCurrentWait: false
                        });
                        console.log(`[Auto-Loop] Selesai! Semua ${totalData} jawaban telah terisi.`);
                        alert(`Sukses! Semua jawaban (${totalData}/${totalData}) telah berhasil diisi dan dikirim.`);
                    }
                    return true;
                }

                // Cek jika halaman konfirmasi selesai tanpa tautan isi ulang
                const confirmationElem = document.querySelector('.freebirdFormviewerViewResponseConfirmationMessage, .vHW8D');
                const pageText = (document.body ? document.body.textContent : '').toLowerCase();
                const isDonePage = confirmationElem || 
                                   pageText.includes("tanggapan anda telah direkam") || 
                                   pageText.includes("your response has been recorded");

                if (isDonePage && (Date.now() - startTime > 4000)) {
                    console.log("[Auto-Loop] Halaman konfirmasi selesai, tetapi form tidak menyediakan tautan tanggapan baru.");
                    await chrome.storage.local.set({
                        loopActive: false,
                        nextRunTimestamp: null,
                        waitStartedAt: null,
                        skipCurrentWait: false
                    });
                    alert(`Selesai pada data #${currentIndex + 1} dari ${totalData}. Formulir tidak mengizinkan pengiriman tanggapan lain.`);
                    return true;
                }
            }

            await delay(350);
        }

        return false;
    } finally {
        isHandlingConfirmation = false;
    }
}

/**
 * Inisialisasi loop pengisian otomatis saat halaman dimuat
 */
async function initAutoLoop() {
    const dataStorage = await chrome.storage.local.get(["responses", "currentIndex", "loopActive"]);
    const responses = dataStorage.responses || [];
    const currentIndex = dataStorage.currentIndex || 0;
    const loopActive = dataStorage.loopActive || false;

    if (!loopActive || responses.length === 0) return;

    await delay(300);

    // Jika sedang berada di halaman konfirmasi respons (misal setelah submit dan reload halaman)
    if (!isFormPage()) {
        const handled = await waitForConfirmationAndContinue(currentIndex, responses.length, 12000);
        if (handled) return;
    }

    const currentData = responses[currentIndex];
    if (currentData) {
        console.log(`[Auto-Loop] Menunggu form siap untuk data #${currentIndex + 1} dari ${responses.length}...`);
        const ready = await waitForFormReady(10000);
        if (ready) {
            console.log(`[Auto-Loop] Mengisi data #${currentIndex + 1} pada form.`);
            await delay(400);
            await runFormAutomation(currentData);
        } else {
            console.warn("[Auto-Loop] Form tidak ditemukan atau waktu muat habis.");
        }
    }
}

/**
 * Listener pesan dari popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FILL_FORM") {
        console.log("Memicu proses fill form dari popup...");
        
        sendResponse({ status: "started" });

        (async () => {
            try {
                let currentData = message.data;
                if (!currentData) {
                    const dataStorage = await chrome.storage.local.get(["responses", "currentIndex"]);
                    const responses = dataStorage.responses || [];
                    const currentIndex = dataStorage.currentIndex || 0;
                    currentData = responses[currentIndex];
                }

                if (currentData) {
                    await runFormAutomation(currentData);
                }
            } catch (err) {
                console.error("Gagal mengisi form:", err);
            }
        })();
        
        return true;
    }
});

/**
 * Jalankan proses isi form beserta navigasi auto-submit jika aktif
 */
async function runFormAutomation(currentData) {
    if (!currentData) return;

    await fillAllQuestions(currentData);

    const dataStorage = await chrome.storage.local.get(["loopActive", "currentIndex", "responses"]);
    const loopActive = dataStorage.loopActive || false;
    const currentIndex = dataStorage.currentIndex || 0;
    const totalData = (dataStorage.responses || []).length;

    if (loopActive) {
        await delay(600);
        const action = handleFormNavigation();

        // 1. Jika tombol 'Berikutnya' diklik (halaman multi-bagian)
        if (action === 'next') {
            console.log("[Auto-Loop] Berpindah ke bagian berikutnya, menunggu transisi halaman...");
            await delay(1200);
            const ready = await waitForFormReady(8000);
            if (ready) {
                await delay(400);
                await runFormAutomation(currentData);
            }
        }
        // 2. Jika tombol 'Kirim' / 'Submit' diklik
        else if (action === 'submit') {
            console.log("[Auto-Loop] Form telah disubmit, menunggu halaman konfirmasi selesai...");
            await delay(800);
            await waitForConfirmationAndContinue(currentIndex, totalData, 20000);
        }
    } else {
        console.log("Form berhasil diisi! Menunggu user mengirim secara manual.");
    }
}

/**
 * Isi semua pertanyaan yang cocok pada halaman form (4 Tahap Anti-Tabrakan)
 */
async function fillAllQuestions(data) {
    document.querySelectorAll('[data-gform-filled]').forEach(el => el.removeAttribute('data-gform-filled'));

    const questionList = (Array.isArray(data) 
        ? data 
        : Object.entries(data).map(([question, answer]) => ({ question, answer })))
        .map(item => {
            const rawQuestion = (item.question || '').replace(/^[-*\d.)\s]+/, '').trim();
            return {
                rawQuestion,
                cleanTarget: normalizeText(rawQuestion),
                answerText: item.answer !== undefined && item.answer !== null ? String(item.answer).trim() : '',
                handled: false
            };
        })
        .filter(item => item.cleanTarget && item.answerText);

    // HANYA ambil baris kisi tabel (Grid Rows), bukan kartu pilihan ganda biasa
    const allRadiogroups = Array.from(document.querySelectorAll('[role="radiogroup"]'));
    const gridRows = allRadiogroups.filter(rg => {
        const isInsideGrid = rg.closest('table, [role="grid"], [role="treegrid"], .jgvuAb, div[data-row-index]');
        const isNotParent = rg.querySelectorAll('[role="radiogroup"]').length === 0;
        return isInsideGrid && isNotParent && rg.querySelectorAll('[role="radio"]').length > 0;
    });

    const allCards = getQuestionCards();

    // =========================================================================
    // TAHAP 1: EXACT MATCH DULU UNTUK SEMUA PERTANYAAN
    // (Mengamankan kartu pendek seperti "Usia" & "Domisili" agar tidak dirampas
    // oleh kalimat "Apakah Anda berusia..." atau "Apakah Anda berdomisili...")
    // =========================================================================
    for (const item of questionList) {
        if (item.handled) continue;

        for (const card of allCards) {
            if (card.getAttribute('data-gform-filled') === 'true') continue;
            if (card.querySelector('table, [role="grid"], .jgvuAb')) continue;

            const headingText = getQuestionHeading(card);
            const cleanHeading = normalizeText(headingText);
            if (!cleanHeading) continue;

            if (cleanHeading === item.cleanTarget) {
                await fillComponent(card, item.answerText);
                card.setAttribute('data-gform-filled', 'true');
                item.handled = true;
                break;
            }
        }
    }

    // =========================================================================
    // TAHAP 2: BARIS KISI / GRID TABEL (Khusus Tabel Multi-Baris)
    // =========================================================================
    for (const item of questionList) {
        if (item.handled) continue;

        for (const row of gridRows) {
            if (row.getAttribute('data-gform-filled') === 'true') continue;

            const cleanRowText = normalizeText(row.textContent);
            if (cleanRowText && (cleanRowText.includes(item.cleanTarget) || item.cleanTarget.includes(cleanRowText.slice(0, 35)))) {
                await fillGridRow(row, item.answerText);
                row.setAttribute('data-gform-filled', 'true');
                item.handled = true;
                break;
            }
        }
    }

    // =========================================================================
    // TAHAP 3: SUBSTRING MATCH PADA HEADING (Untuk pertanyaan yang belum terisi)
    // =========================================================================
    for (const item of questionList) {
        if (item.handled) continue;

        for (const card of allCards) {
            if (card.getAttribute('data-gform-filled') === 'true') continue;
            if (card.querySelector('table, [role="grid"], .jgvuAb')) continue;

            const headingText = getQuestionHeading(card);
            const cleanHeading = normalizeText(headingText);
            if (!cleanHeading) continue;

            // Cegah pertanyaan kalimat panjang menabrak heading pendek (< 10 huruf)
            const isMatch = cleanHeading.includes(item.cleanTarget) ||
                            (cleanHeading.length >= 10 && item.cleanTarget.includes(cleanHeading));

            if (isMatch) {
                await fillComponent(card, item.answerText);
                card.setAttribute('data-gform-filled', 'true');
                item.handled = true;
                break;
            }
        }
    }

    // =========================================================================
    // TAHAP 4: FALLBACK KONTEN KARTU PENUH
    // =========================================================================
    for (const item of questionList) {
        if (item.handled) continue;

        for (const card of allCards) {
            if (card.getAttribute('data-gform-filled') === 'true') continue;
            if (card.querySelector('table, [role="grid"], .jgvuAb')) continue;

            const cleanCardText = normalizeText(card.textContent);
            if (cleanCardText && cleanCardText.includes(item.cleanTarget)) {
                await fillComponent(card, item.answerText);
                card.setAttribute('data-gform-filled', 'true');
                item.handled = true;
                break;
            }
        }
    }
}

/**
 * Mengisi baris kisi (Multiple Choice Grid)
 */
async function fillGridRow(rowContainer, targetAnswer) {
    const radios = Array.from(rowContainer.querySelectorAll('[role="radio"]'));
    if (radios.length === 0) return;

    const targetVal = String(targetAnswer).trim();
    const cleanAnswer = normalizeText(targetVal);

    // Jawaban berupa angka skala tunggal (misal 1 - 5)
    if (/^\d+$/.test(targetVal)) {
        const num = parseInt(targetVal, 10);

        const byDataVal = radios.find(r => (r.getAttribute('data-value') || '').trim() === targetVal);
        if (byDataVal) {
            selectElement(byDataVal);
            return;
        }

        if (num >= 1 && num <= radios.length) {
            selectElement(radios[num - 1]);
            return;
        }
    }

    // Pencocokan teks opsi kisi
    for (const radio of radios) {
        const ariaLabel = normalizeText(radio.getAttribute('aria-label') || '');
        const dataVal = normalizeText(radio.getAttribute('data-value') || '');

        if (dataVal === cleanAnswer || ariaLabel.includes(cleanAnswer)) {
            selectElement(radio);
            return;
        }
    }
}

/**
 * Mengisi komponen input di dalam satu kartu pertanyaan
 */
async function fillComponent(container, answer) {
    if (answer === undefined || answer === null) return;
    const targetAnswer = String(answer).trim();
    if (!targetAnswer) return;

    const targetLower = targetAnswer.toLowerCase();
    const cleanAnswer = normalizeText(targetAnswer);

    // 1. DROPDOWN (Menu Tarik-Turun)
    const dropdownTrigger = container.querySelector('[role="listbox"], [aria-haspopup="true"], .quantumWizMenuPaperselectOptionList');
    if (dropdownTrigger) {
        dropdownTrigger.focus();
        selectElement(dropdownTrigger);
        await delay(500);

        const options = Array.from(document.querySelectorAll('div[role="option"], .quantumWizMenuPaperselectOption, .exportSelectPopup div[role="option"]'));

        const targetOption = options.find(opt => {
            if (opt.offsetParent === null) return false;

            const optData = (opt.getAttribute('data-value') || '').toLowerCase().trim();
            const optText = (opt.textContent || '').toLowerCase().trim();

            if (!optText || optText === 'pilih' || optText === 'choose') return false;

            const cleanOpt = normalizeText(optText);

            if (optData === targetLower || optText === targetLower || cleanOpt === cleanAnswer) return true;

            return optData.includes(targetLower) || optText.includes(targetLower) ||
                   (cleanAnswer && (cleanOpt.includes(cleanAnswer) || cleanAnswer.includes(cleanOpt)));
        });

        if (targetOption) {
            selectElement(targetOption);
            await delay(200);
            return;
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
    }

    // 2. RADIO BUTTONS (Pilihan Ganda & Skala Linier)
    const radios = Array.from(container.querySelectorAll('[role="radio"]'));
    if (radios.length > 0) {
        let matchedRadio = null;

        // A. Cek Skala Angka Murni (1 digit / Likert Scale, bukan rentang seperti "25-34")
        if (/^\d+$/.test(targetAnswer)) {
            matchedRadio = radios.find(r => {
                const dataVal = (r.getAttribute('data-value') || '').trim();
                const ariaLabel = (r.getAttribute('aria-label') || '').trim();
                return dataVal === targetAnswer || ariaLabel === targetAnswer || 
                       ariaLabel.startsWith(targetAnswer + ',') || ariaLabel.startsWith(targetAnswer + ' ');
            });

            if (!matchedRadio) {
                const num = parseInt(targetAnswer, 10);
                if (num >= 1 && num <= radios.length) {
                    matchedRadio = radios[num - 1];
                }
            }
        }

        // B. Pencocokan Teks Opsi (Fase 1: Exact Match)
        if (!matchedRadio) {
            matchedRadio = radios.find(radio => {
                const dataVal = (radio.getAttribute('data-value') || '').toLowerCase().trim();
                const ariaLabel = (radio.getAttribute('aria-label') || '').toLowerCase().trim();
                const parentRow = radio.closest('.docssharedWizToggleLabeledControl, .nWQGrd, label') || radio.parentElement;
                const labelText = (parentRow ? parentRow.textContent : '').toLowerCase().trim();

                const cleanData = normalizeText(dataVal);
                const cleanAria = normalizeText(ariaLabel);
                const cleanLabel = normalizeText(labelText);

                return dataVal === targetLower || ariaLabel === targetLower || labelText === targetLower ||
                       cleanData === cleanAnswer || cleanAria === cleanAnswer || cleanLabel === cleanAnswer;
            });
        }

        // Pencocokan Teks Opsi (Fase 2: Partial Match — contoh "25-34" cocok ke "25-34 Tahun", "Timur" cocok ke "Purwokerto Timur")
        if (!matchedRadio) {
            matchedRadio = radios.find(radio => {
                const dataVal = (radio.getAttribute('data-value') || '').toLowerCase().trim();
                const ariaLabel = (radio.getAttribute('aria-label') || '').toLowerCase().trim();
                const parentRow = radio.closest('.docssharedWizToggleLabeledControl, .nWQGrd, label') || radio.parentElement;
                const labelText = (parentRow ? parentRow.textContent : '').toLowerCase().trim();

                if (ariaLabel.includes('lainnya') || ariaLabel.includes('yang lain') || ariaLabel.includes('other') ||
                    labelText.includes('lainnya') || labelText.includes('yang lain') || labelText.includes('other')) {
                    return false;
                }

                const cleanData = normalizeText(dataVal);
                const cleanAria = normalizeText(ariaLabel);
                const cleanLabel = normalizeText(labelText);

                return (cleanData && (cleanData.includes(cleanAnswer) || cleanAnswer.includes(cleanData))) ||
                       (cleanAria && (cleanAria.includes(cleanAnswer) || cleanAnswer.includes(cleanAria))) ||
                       (cleanLabel && (cleanLabel.includes(cleanAnswer) || cleanAnswer.includes(cleanLabel)));
            });
        }

        if (matchedRadio) {
            selectElement(matchedRadio);
            return;
        }

        // C. Opsi "Lainnya" / "Other"
        const otherRadio = radios.find(r => {
            const aria = (r.getAttribute('aria-label') || '').toLowerCase();
            const data = (r.getAttribute('data-value') || '').toLowerCase();
            const parentRow = r.closest('.docssharedWizToggleLabeledControl, .nWQGrd, label') || r.parentElement;
            const txt = (parentRow ? parentRow.textContent : '').toLowerCase();

            return aria.includes('lainnya') || aria.includes('yang lain') || aria.includes('other') ||
                   data.includes('lainnya') || data.includes('yang lain') || data.includes('other') ||
                   txt.includes('lainnya') || txt.includes('yang lain') || txt.includes('other');
        });

        if (otherRadio) {
            selectElement(otherRadio);
            await delay(150);
            const otherInput = container.querySelector('.Hvn33, input[type="text"]');
            if (otherInput) {
                setNativeInputValue(otherInput, targetAnswer);
            }
        }
        return;
    }

    // 3. CHECKBOXES (Kotak Centang)
    const checkboxes = Array.from(container.querySelectorAll('[role="checkbox"]'));
    if (checkboxes.length > 0) {
        const answersList = targetAnswer.split(',').map(a => a.trim()).filter(Boolean);
        const matchedOptions = [];

        checkboxes.forEach(checkbox => {
            const dataVal = (checkbox.getAttribute('data-value') || '').toLowerCase().trim();
            const ariaLabel = (checkbox.getAttribute('aria-label') || '').toLowerCase().trim();
            const parentRow = checkbox.closest('.docssharedWizToggleLabeledControl, .nWQGrd, label') || checkbox.parentElement;
            const labelText = (parentRow ? parentRow.textContent : '').toLowerCase().trim();

            const isOther = ariaLabel.includes('lainnya') || ariaLabel.includes('yang lain') || ariaLabel.includes('other') ||
                            labelText.includes('lainnya') || labelText.includes('yang lain') || labelText.includes('other');
            if (isOther) return;

            const cleanData = normalizeText(dataVal);
            const cleanAria = normalizeText(ariaLabel);
            const cleanLabel = normalizeText(labelText);

            const shouldCheck = answersList.some(target => {
                const cleanTarget = normalizeText(target);
                const targetL = target.toLowerCase();
                return dataVal === targetL || ariaLabel === targetL || labelText === targetL ||
                       (cleanTarget && (cleanData === cleanTarget || cleanAria === cleanTarget || cleanLabel === cleanTarget ||
                                        cleanData.includes(cleanTarget) || cleanLabel.includes(cleanTarget)));
            });

            if (shouldCheck) {
                matchedOptions.push(checkbox);
            }

            const isCurrentlyChecked = checkbox.getAttribute('aria-checked') === 'true';
            if (shouldCheck !== isCurrentlyChecked) {
                selectElement(checkbox);
            }
        });

        // Tangani isian teks kustom pada opsi "Lainnya"
        const customAnswers = answersList.filter(ans => {
            const cleanAns = normalizeText(ans);
            return !matchedOptions.some(cb => {
                const text = (cb.getAttribute('aria-label') || cb.textContent || '').toLowerCase();
                return normalizeText(text).includes(cleanAns);
            });
        });

        if (customAnswers.length > 0) {
            const otherCheckbox = checkboxes.find(cb => {
                const aria = (cb.getAttribute('aria-label') || '').toLowerCase();
                const parentRow = cb.closest('.docssharedWizToggleLabeledControl, .nWQGrd, label') || cb.parentElement;
                const txt = (parentRow ? parentRow.textContent : '').toLowerCase();
                return aria.includes('lainnya') || aria.includes('yang lain') || aria.includes('other') ||
                       txt.includes('lainnya') || txt.includes('yang lain') || txt.includes('other');
            });

            if (otherCheckbox) {
                if (otherCheckbox.getAttribute('aria-checked') !== 'true') {
                    selectElement(otherCheckbox);
                }
                await delay(150);
                const otherInput = container.querySelector('.Hvn33, input[type="text"]');
                if (otherInput) {
                    setNativeInputValue(otherInput, customAnswers.join(', '));
                }
            }
        }
        return;
    }

    // 4. DATE INPUT (Tanggal)
    const dateInput = container.querySelector('input[type="date"]');
    if (dateInput) {
        let formattedDate = targetAnswer;
        const parts = targetAnswer.split(/[-/]/);
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                formattedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else if (parts[2].length === 4) {
                formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }
        setNativeInputValue(dateInput, formattedDate);
        return;
    }

    // Input tanggal terpisah (Hari / Bulan / Tahun)
    const subDateInputs = Array.from(container.querySelectorAll('input[type="text"], input:not([type])')).filter(inp => {
        const label = (inp.getAttribute('aria-label') || '').toLowerCase();
        return label.includes('hari') || label.includes('bulan') || label.includes('tahun') ||
               label.includes('day') || label.includes('month') || label.includes('year');
    });

    if (subDateInputs.length >= 3) {
        const parts = targetAnswer.split(/[-/]/);
        if (parts.length === 3) {
            let day, month, year;
            if (parts[0].length === 4) {
                [year, month, day] = parts;
            } else {
                [day, month, year] = parts;
            }

            subDateInputs.forEach(inp => {
                const label = (inp.getAttribute('aria-label') || '').toLowerCase();
                let val = '';
                if (label.includes('hari') || label.includes('day')) val = day;
                else if (label.includes('bulan') || label.includes('month')) val = month;
                else if (label.includes('tahun') || label.includes('year')) val = year;

                if (val) {
                    setNativeInputValue(inp, val);
                }
            });
            return;
        }
    }

    // 5. INPUT TEXT, EMAIL, NUMBER, TEL, & TEXTAREA
    const inputs = container.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea');
    const standardInputs = Array.from(inputs).filter(inp => !inp.classList.contains('Hvn33') && inp.getAttribute('role') !== 'combobox');
    if (standardInputs.length > 0) {
        standardInputs.forEach(input => {
            setNativeInputValue(input, targetAnswer);
        });
        return;
    }
}

/**
 * Mencari dan menekan tombol navigasi formulir (Kirim / Berikutnya)
 */
function handleFormNavigation() {
    console.log("[Navigation] Mencari tombol navigasi...");

    const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], button'));
    let targetButton = null;
    let actionType = null;

    // 1. Cari Submit / Kirim
    for (const btn of allButtons) {
        if (btn.offsetParent === null) continue;
        const text = (btn.textContent || btn.innerText || '').toLowerCase().trim();
        if (text === "kirim" || text === "submit" || text.startsWith("kirim") || text.startsWith("submit")) {
            targetButton = btn;
            actionType = 'submit';
            break;
        }
    }

    // 2. Cari Berikutnya / Next
    if (!targetButton) {
        for (const btn of allButtons) {
            if (btn.offsetParent === null) continue;
            const text = (btn.textContent || btn.innerText || '').toLowerCase().trim();
            if (text === "berikutnya" || text === "next" || text.startsWith("berikutnya") || text.startsWith("next")) {
                targetButton = btn;
                actionType = 'next';
                break;
            }
        }
    }

    // 3. Fallback Selector
    if (!targetButton) {
        const navContainer = document.querySelector('.appsMaterialWewebAnimateFormbuttonNavButton, .uArJ5e[role="button"]');
        if (navContainer && navContainer.offsetParent !== null) {
            targetButton = navContainer;
            const txt = (navContainer.textContent || '').toLowerCase().trim();
            actionType = (txt.includes('kirim') || txt.includes('submit')) ? 'submit' : 'next';
        }
    }

    if (targetButton) {
        console.log(`[Navigation] Menekan tombol ${actionType}:`, targetButton.textContent.trim());
        selectElement(targetButton);
        return actionType;
    }

    return null;
}