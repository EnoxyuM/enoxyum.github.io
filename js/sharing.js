function encodeBaseCustom(bytes) {
    if (bytes.length === 0) return '';
    let leadingZeros = 0;
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++)  leadingZeros++;
    let num = 0n;
    for (let i = leadingZeros; i < bytes.length; i++) num = (num << 8n) + BigInt(bytes[i]);
    let encoded = '';
    while (num > 0) { const remainder = num % BASE; num /= BASE; encoded = URL_ALPHABET[Number(remainder)] + encoded; }
    return URL_ALPHABET[0].repeat(leadingZeros) + encoded;
}

function decodeBaseCustom(str) {
    if (str.length === 0) return new Uint8Array();
    let leadingZeros = 0;
    for (let i = 0; i < str.length && str[i] === URL_ALPHABET[0]; i++) leadingZeros++;
    let num = 0n;
    for (let i = leadingZeros; i < str.length; i++) {
        const charValue = ALPHABET_MAP.get(str[i]);
        if (charValue === undefined) throw new Error(`Invalid character in input: ${str[i]}`);
        num = num * BASE + charValue;
    }
    const bytes = [];
    while (num > 0) { bytes.push(Number(num & 255n)); num >>= 8n; }
    return new Uint8Array([...Array(leadingZeros).fill(0), ...bytes.reverse()]);
}

function encodeVarint(value) {
    const bytes = [];
    while (value >= 0x80) { bytes.push((value & 0x7F) | 0x80); value >>>= 7; }
    bytes.push(value);
    return new Uint8Array(bytes);
}

function decodeVarint(bytes, offset) {
    let value = 0, shift = 0, currentOffset = offset;
    while (true) {
        if (currentOffset >= bytes.length) throw new Error("Malformed Varint: Unexpected end of buffer.");
        const byte = bytes[currentOffset++];
        value |= (byte & 0x7F) << shift;
        if ((byte & 0x80) === 0) return { value, newOffset: currentOffset };
        shift += 7;
    }
}

function serializeProjectOptimized(projectFileOrder, projectFiles) {
    const textEncoder = new TextEncoder();
    const parts = [];

    projectFileOrder.forEach(name => {
        if (!projectFiles[name] || name.split('/').pop() === '.p') return;
        
        const fileData = projectFiles[name];
        const nameBytes = textEncoder.encode(name);
        
        parts.push(encodeVarint(nameBytes.length));
        parts.push(nameBytes);

        if (fileData.isBinary) {
            parts.push(new Uint8Array([1]));
            
            const mimeTypeBytes = textEncoder.encode(fileData.mimeType);
            parts.push(encodeVarint(mimeTypeBytes.length));
            parts.push(mimeTypeBytes);

            const contentBytes = pako.ungzip(fileData.content);
            parts.push(encodeVarint(contentBytes.length));
            parts.push(contentBytes);
        } else {
            parts.push(new Uint8Array([0]));
            
            const codeBytes = textEncoder.encode(fileData.code);
            parts.push(encodeVarint(codeBytes.length));
            parts.push(codeBytes);
        }
    });

    const totalLength = parts.reduce((acc, part) => acc + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) { result.set(part, offset); offset += part.length; }
    return result;
}

function deserializeProjectOptimized(bytes) {
    const textDecoder = new TextDecoder();
    const filesToLoad = {};
    let offset = 0;

    while (offset < bytes.length) {
        const nameLenResult = decodeVarint(bytes, offset);
        offset = nameLenResult.newOffset;
        const name = textDecoder.decode(bytes.subarray(offset, offset + nameLenResult.value));
        offset += nameLenResult.value;

        const isBinary = bytes[offset] === 1;
        offset += 1;
        
        if (isBinary) {
            const mimeLenResult = decodeVarint(bytes, offset);
            offset = mimeLenResult.newOffset;
            const mimeType = textDecoder.decode(bytes.subarray(offset, offset + mimeLenResult.value));
            offset += mimeLenResult.value;

            const contentLenResult = decodeVarint(bytes, offset);
            offset = contentLenResult.newOffset;
            const contentBytes = bytes.subarray(offset, offset + contentLenResult.value);
            offset += contentLenResult.value;

            const compressedContent = pako.gzip(contentBytes);
            filesToLoad[name] = { isBinary: true, mimeType: mimeType, content: compressedContent };
        } else {
            const codeLenResult = decodeVarint(bytes, offset);
            offset = codeLenResult.newOffset;
            const code = textDecoder.decode(bytes.subarray(offset, offset + codeLenResult.value));
            offset += codeLenResult.value;

            filesToLoad[name] = { code: code, isBinary: false };
        }
    }
    
    return { filesToLoad };
}

async function generateShareableUrl(prefix = '#p=') {
    try {
        if (activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
            files[activeFilePath].code = editor.getValue();
        }
        
        const fileList = Object.keys(files);
        const binaryData = serializeProjectOptimized(fileList, files);
        
        const compressed = pako.gzip(binaryData, { level: 9 });
        
        const encodedData = encodeBaseCustom(compressed);
        
        const url = `${location.origin}${location.pathname}${prefix}${encodedData}`;
        await navigator.clipboard.writeText(url);
        showNotification(prefix === '#p=' ? 'URL link copied' : 'Preview link copied');
    } catch (e) {
        console.error("Share error:", e);
        showNotification('Error creating link');
    }
}

async function loadFromUrlHash() {
    if (!location.hash.startsWith('#p=')) return false;
    try {
        const encodedData = location.hash.substring(3);
        const compressedBytes = decodeBaseCustom(encodedData);
        const decompressed = pako.ungzip(compressedBytes);
        const binaryData = new Uint8Array(decompressed);
        const { filesToLoad } = deserializeProjectOptimized(binaryData);

        if (Object.keys(filesToLoad).length > 0) {
            const newOpenTabs = Object.keys(filesToLoad);
            const indexHtmlPath = newOpenTabs.find(key => key.toLowerCase() === 'index.html');
            if(indexHtmlPath) {
                const index = newOpenTabs.indexOf(indexHtmlPath);
                if (index > -1) {
                    newOpenTabs.splice(index, 1);
                    newOpenTabs.unshift(indexHtmlPath);
                }
            }
            initializeEditorWithFiles(filesToLoad, newOpenTabs, null);
            currentProjectId = null;
            updateProjectTitle();
            history.replaceState(null, '', location.pathname + location.search);
            showNotification('URL Project loaded');
            return true;
        }
    } catch(e) { 
        console.error("URL load error:", e); 
        showNotification('Invalid or corrupted link');
    }
    return false;
}