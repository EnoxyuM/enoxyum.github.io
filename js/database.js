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