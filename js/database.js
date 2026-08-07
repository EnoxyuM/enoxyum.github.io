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
    isDbDirty = true;

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).add(p);

        r.onsuccess = e => {
            const id = e.target.result;
            p.id = id;
            upsertProjectMeta(p, true);
            res(id);
        };

        r.onerror = e => rej('Error saving project');
    });
}

function updateCode(p) {
    isDbDirty = true;

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put(p);

        r.onsuccess = e => {
            upsertProjectMeta(p, true);
            res(e.target.result);
        };

        r.onerror = e => rej('Error updating project');
    });
}

function deleteCode(id) {
    isDbDirty = true;

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id);

        r.onsuccess = () => {
            removeProjectMeta(id);
            res();
        };

        r.onerror = () => rej('Error deleting project');
    });
}

function getCodes() {
    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).getAll();

        r.onsuccess = e => {
            const projects = e.target.result;

            if (Array.isArray(projects)) {
                projects.forEach(project => {
                    upsertProjectMeta(project, true);
                });
            }

            res(projects);
        };

        r.onerror = e => rej('Error getting projects');
    });
}

function getAllProjectKeys() {
    return new Promise(resolve => {
        try {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.openKeyCursor(null, 'next');
            const keys = [];

            request.onsuccess = e => {
                const cursor = e.target.result;
                if (cursor) {
                    keys.push(cursor.primaryKey);
                    cursor.continue();
                } else {
                    resolve(keys);
                }
            };

            request.onerror = () => resolve(keys);
        } catch (e) {
            resolve([]);
        }
    });
}

async function ensureProjectMetaCacheReady() {
    if (projectMetaReady) return;

    try {
        const keys = await getAllProjectKeys();
        const keySet = new Set(keys);

        for (const id of Array.from(projectMetaCache.keys())) {
            if (!keySet.has(id)) {
                projectMetaCache.delete(id);
            }
        }

        keys.forEach(id => {
            addPlaceholderProjectMeta(id);
        });

        saveProjectMetaCache();
        projectMetaReady = true;
        localStorage.setItem('codium_project_meta_ready', 'true');
    } catch (e) {
        console.error('Could not prepare project meta cache', e);
    }
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
        let originalName = file.name;
        let finalName = originalName;
        let finalPath = (basePath ? `${basePath}/${finalName}` : finalName).replace(/^\//, '');

        if (files[finalPath]) {
            let counter = 1;
            const nameParts = originalName.split('.');
            const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
            const baseName = nameParts.join('.');

            do {
                finalName = `${baseName}(${counter})${extension}`;
                finalPath = (basePath ? `${basePath}/${finalName}` : finalName).replace(/^\//, '');
                counter++;
            } while (files[finalPath]);
        }

        const reader = new FileReader();
        const extension = finalName.split('.').pop().toLowerCase();
        const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));

        reader.onload = e => {
            if (isText) {
                const code = e.target.result;
                files[finalPath] = {
                    code: code,
                    doc: CodeMirror.Doc(code, getModeForFilename(finalPath)),
                    isBinary: false
                };
                openFile(finalPath);
            } else {
                const arrayBuffer = e.target.result;
                const compressed = pako.gzip(new Uint8Array(arrayBuffer));
                files[finalPath] = {
                    isBinary: true,
                    mimeType: file.type || 'application/octet-stream',
                    content: compressed,
                };
            }

            remaining--;
            if (remaining === 0) onDone();
        };

        reader.onerror = e => {
            showNotification(`Error reading ${originalName}`);
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