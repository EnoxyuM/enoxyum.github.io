function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = e => {
            db = e.target.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }

            if (!db.objectStoreNames.contains(META_STORE_NAME)) {
                db.createObjectStore(META_STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = e => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = e => reject('Error opening database');
    });
}

function getProjectRecord(id) {
    return new Promise((resolve, reject) => {
        const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(id);

        request.onsuccess = e => resolve(e.target.result);
        request.onerror = e => reject(e);
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

function loadProjectMetaCacheFromDB() {
    return new Promise(resolve => {
        try {
            const request = db.transaction([META_STORE_NAME], 'readonly').objectStore(META_STORE_NAME).getAll();

            request.onsuccess = e => {
                projectMetaCache = new Map();

                const metas = e.target.result || [];
                metas.forEach(meta => {
                    if (meta && meta.id !== undefined) {
                        setProjectMetaLocal(meta);
                    }
                });

                resolve();
            };

            request.onerror = () => resolve();
        } catch (e) {
            resolve();
        }
    });
}

function putProjectMetaRecord(meta) {
    return new Promise((resolve, reject) => {
        const request = db.transaction([META_STORE_NAME], 'readwrite').objectStore(META_STORE_NAME).put(meta);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error saving project meta');
    });
}

function deleteProjectMetaRecord(id) {
    return new Promise((resolve, reject) => {
        const request = db.transaction([META_STORE_NAME], 'readwrite').objectStore(META_STORE_NAME).delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error deleting project meta');
    });
}

async function saveProjectMeta(meta) {
    if (!meta || meta.id === undefined || meta.id === null) return;
    setProjectMetaLocal(meta);
    await putProjectMetaRecord(meta);
}

async function removeProjectMeta(id) {
    removeProjectMetaLocal(id);
    await deleteProjectMetaRecord(id);
}

async function updateProjectMetaOnly(id, changes = {}) {
    const existing = getProjectMeta(id) || { id };

    const meta = {
        id,
        name: '',
        date: 0,
        createdDate: 0,
        version: null,
        parentId: null,
        inTrash: false,
        order: null,
        size: 0,
        known: false,
        ...existing,
        ...changes,
        known: true
    };

    if (meta.parentId === undefined) meta.parentId = null;
    if (meta.version === undefined) meta.version = null;
    if (meta.order === undefined) meta.order = null;

    await saveProjectMeta(meta);
    return meta;
}

async function syncProjectMetaFromRecord(record, mode = 'save') {
    if (!record || record.id === undefined || record.id === null) return null;

    const meta = mode === 'hydrate'
        ? extractProjectMetaForHydration(record)
        : extractProjectMetaForSave(record);

    if (!meta) return null;

    await saveProjectMeta(meta);
    return meta;
}

async function ensureProjectMetaPlaceholders() {
    const keys = await getAllProjectKeys();
    const keySet = new Set(keys);

    const missing = [];

    keys.forEach(id => {
        if (!getProjectMeta(id)) {
            missing.push({
                id,
                name: '',
                date: 0,
                createdDate: 0,
                version: null,
                parentId: null,
                inTrash: false,
                order: null,
                size: 0,
                known: false
            });
        }
    });

    const stale = getAllProjectMeta().filter(meta => !keySet.has(meta.id));

    if (missing.length > 0) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction([META_STORE_NAME], 'readwrite');
            const store = tx.objectStore(META_STORE_NAME);

            missing.forEach(meta => store.put(meta));

            tx.oncomplete = () => {
                missing.forEach(setProjectMetaLocal);
                resolve();
            };

            tx.onerror = () => reject('Error creating meta placeholders');
        });
    }

    if (stale.length > 0) {
        await new Promise((resolve, reject) => {
            const tx = db.transaction([META_STORE_NAME], 'readwrite');
            const store = tx.objectStore(META_STORE_NAME);

            stale.forEach(meta => store.delete(meta.id));

            tx.oncomplete = () => {
                stale.forEach(meta => removeProjectMetaLocal(meta.id));
                resolve();
            };

            tx.onerror = () => reject('Error removing stale meta');
        });
    }
}

function hydrateProjectMetadata(force = false) {
    if (!force && projectMetaHydrated) {
        return Promise.resolve();
    }

    if (metaHydrationPromise) {
        return metaHydrationPromise;
    }

    metaHydrationPromise = (async () => {
        const keys = await getAllProjectKeys();
        let processed = 0;

        for (const id of keys) {
            const meta = getProjectMeta(id);

            if (!meta || !meta.known) {
                try {
                    const record = await getProjectRecord(id);

                    if (record && record.files) {
                        await syncProjectMetaFromRecord(record, 'hydrate');
                    } else {
                        await removeProjectMeta(id);
                    }
                } catch (e) {
                    console.error('Meta hydration error for project', id, e);
                }
            }

            processed++;

            if (processed % 3 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        projectMetaHydrated = true;
        localStorage.setItem('codium_meta_hydrated_v2', 'true');
    })().finally(() => {
        metaHydrationPromise = null;
    });

    return metaHydrationPromise;
}

function saveCode(p) {
    isDbDirty = true;

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).add(p);

        r.onsuccess = e => {
            const id = e.target.result;
            p.id = id;

            syncProjectMetaFromRecord(p, 'save')
                .catch(console.error)
                .finally(() => res(id));
        };

        r.onerror = e => rej('Error saving project');
    });
}

function updateCode(p) {
    isDbDirty = true;

    applyProjectMetaToRecord(p);

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).put(p);

        r.onsuccess = e => {
            syncProjectMetaFromRecord(p, 'save')
                .catch(console.error)
                .finally(() => res(e.target.result));
        };

        r.onerror = e => rej('Error updating project');
    });
}

function deleteCode(id) {
    isDbDirty = true;

    return new Promise((res, rej) => {
        const r = db.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME).delete(id);

        r.onsuccess = () => {
            removeProjectMeta(id)
                .catch(console.error)
                .finally(() => res());
        };

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