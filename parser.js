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

window.parseResponses = parseResponses;