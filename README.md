# Google Form AutoFill Extension

A browser extension designed to automatically fill out Google Forms based on question title matching rather than static indexing. This approach makes the extension highly adaptive to changes in form structures. It supports various input types, including Short/Long Paragraphs, Radio Buttons, Checkboxes, and Dropdowns.

---

## What's New in the Latest Update?
* **Fully Automated Aggressive Dropdown Filler:** Upgraded from manual-triggering to an active polling system with human-like click simulation (`mousedown` -> `mouseup` -> `click`). It now opens and selects dropdown options completely automatically without requiring user clicks.
* **Multi-Page & Multi-Section Form Navigation:** Added smart page detection. The extension automatically detects whether it's on an intermediate page (clicks "Next"/"Berikutnya") or the final page (clicks "Submit"/"Kirim").
* **Automated Sequential Loop (Auto-Loop):** When "Automatic Submit" is enabled, the script auto-increments the data index, handles the success page ("Submit another response"), and loops back to fill the next batch seamlessly.

---

## Installation Guide for Various Browsers

Before proceeding, ensure you have downloaded or cloned this repository to your local machine and extracted it if it is in a ZIP format.

### 1. Google Chrome / Brave / Opera GX
Since these browsers are built on the Chromium engine, the installation steps are nearly identical:

1. Open your browser and navigate to the extensions page:
   * **Chrome:** Go to `chrome://extensions/`
   * **Brave:** Go to `brave://extensions/`
   * **Opera GX:** Go to `opera://extensions/`
2. Enable **Developer mode** using the toggle switch typically located in the top-right corner of the page.
3. Click the **Load unpacked** button located in the top-left section.
4. Select the main project folder (`GForm-AutoFill`) that contains the `manifest.json` file.
5. The extension is now installed. Click the extensions icon (puzzle piece) in the toolbar to pin it for quick access.

### 2. Microsoft Edge
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Turn on the **Developer mode** toggle switch located in the bottom-left sidebar menu.
3. Click the **Load unpacked** button that appears at the top of the page.
4. Select the main project folder (`GForm-AutoFill`).
5. The extension is ready for use.

### 3. Mozilla Firefox
Firefox has a stricter security policy for local, unsigned extensions. You can load it temporarily for testing purposes using these steps:

1. Open Firefox and type `about:debugging` in the URL bar, then press Enter.
2. Click on **This Firefox** in the left-hand menu.
3. Click the **Load Temporary Add-on...** button.
4. Navigate to your project folder and select the **`manifest.json`** file.
5. *Note:* Temporary extensions in Firefox are removed automatically when the browser is closed. You will need to reload the file using these steps each time you restart Firefox.

---

## Key Features
* **Adaptive Matching:** Utilizes question text to match and populate data accurately, independent of question order.
* **Multi-component Support:** Functions seamlessly across standard text inputs, multiple-choice options (Radio Buttons), multi-select options (Checkboxes), and Dropdowns.
* **Multi-Page Support:** Dynamically scans active questions on multi-section forms, skipping missing fields until they appear on subsequent pages.
* **Data Preview:** Allows verification of mapped data before filling out the active form.

### Important Note Regarding Dropdowns
Due to the dynamic way Google Forms loads dropdown components, the autofill process cannot select a dropdown option completely automatically on its own. To fill a dropdown question, you must first click and open the dropdown menu manually on the form. Once the menu is open, the extension will instantly detect the options and select the correct answer for you.

---

## Support & Donation
If this extension saves you time during your studies or daily tasks, you can support the project via the custom donation link provided directly inside the extension's popup interface.