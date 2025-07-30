function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = e => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = e => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = e => reject('Error opening database');
    });
}

function saveCode(p) {
    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).add(p);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej('Error saving project');
    });
}

function updateCode(p) {
    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put(p);
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej('Error updating project');
    });
}

function deleteCode(id) {
    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id);
        r.onsuccess = () => res();
        r.onerror = () => rej('Error deleting project');
    });
}

function getCodes() {
    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();
        r.onsuccess = e => res(e.target.result);
        r.onerror = e => rej('Error getting projects');
    });
}

function uploadFiles(fileList, basePath) {
    const filesToProcess = Array.from(fileList);
    let remaining = filesToProcess.length;
    if (remaining === 0) return;

    const onDone = () => {
        renderAll();
        if (liveUpdateToggle.checked) {
            updateScene();
        }
        showNotification(`Finished uploading ${filesToProcess.length} file(s).`);
    };

    const TEXT_EXTENSIONS = new Set(['txt', 'js', 'json', 'html', 'htm', 'css', 'xml', 'svg', 'md', 'csv', 'log', 'ini', 'yaml', 'yml', 'toml', 'sh', 'bash', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'ts', 'tsx', 'jsx']);

    filesToProcess.forEach(file => {
        const newPath = (basePath ? `${basePath}/${file.name}` : file.name).replace(/^\//, '');

        if (files[newPath] && !confirm(`File "${newPath}" already exists. Overwrite?`)) {
            remaining--;
            if (remaining === 0) onDone();
            return;
        }

        const reader = new FileReader();
        const extension = file.name.split('.').pop().toLowerCase();
        const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));

        reader.onload = e => {
            if (isText) {
                const code = e.target.result;
                files[newPath] = {
                    code: code,
                    doc: CodeMirror.Doc(code, getModeForFilename(newPath)),
                    isBinary: false
                };
                openFile(newPath);
            } else {
                const arrayBuffer = e.target.result;
                const compressed = pako.gzip(new Uint8Array(arrayBuffer));
                files[newPath] = {
                    isBinary: true,
                    mimeType: file.type || 'application/octet-stream',
                    content: compressed,
                };
            }
            remaining--;
            if (remaining === 0) onDone();
        };

        reader.onerror = e => {
            showNotification(`Error reading ${file.name}`);
            console.error(e);
            remaining--;
            if (remaining === 0) onDone();
        };

        if (isText) {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    });
}