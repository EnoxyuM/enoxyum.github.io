// js/database.js
if (typeof LIB_STORE_NAME === 'undefined') {
window.LIB_STORE_NAME = 'library';
}
if (typeof LIB_META_STORE_NAME === 'undefined') {
window.LIB_META_STORE_NAME = 'libraryMeta';
}
if (typeof libraryMetaCache === 'undefined') {
window.libraryMetaCache = new Map();
}
if (typeof libraryMetaLoaded === 'undefined') {
window.libraryMetaLoaded = false;
}
if (typeof libraryMetaLoadPromise === 'undefined') {
window.libraryMetaLoadPromise = null;
}

function normalizeProjectFilesForStorage(fileSet) {
const out = {};
if (!fileSet) return out;
for (const path in fileSet) {
const fd = fileSet[path];
if (!fd) continue;
if (typeof fd === 'string') {
out[path] = { isBinary: false, code: fd };
continue;
}
if (fd.libRef != null) {
const minimal = {
libRef: fd.libRef,
isBinary: !!fd.isBinary
};
if (fd.isBinary && fd.mimeType) minimal.mimeType = fd.mimeType;
out[path] = minimal;
continue;
}
if (fd.isBinary) {
out[path] = {
isBinary: true,
mimeType: fd.mimeType || 'application/octet-stream',
content: fd.content !== undefined ? fd.content : pako.gzip(new Uint8Array(0))
};
} else {
out[path] = {
isBinary: false,
code: fd.code !== undefined ? fd.code : ''
};
}
}
return out;
}

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
if (!db.objectStoreNames.contains(LIB_STORE_NAME)) {
db.createObjectStore(LIB_STORE_NAME, { keyPath: 'id', autoIncrement: true });
}
if (!db.objectStoreNames.contains(LIB_META_STORE_NAME)) {
db.createObjectStore(LIB_META_STORE_NAME, { keyPath: 'id' });
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
p.files = normalizeProjectFilesForStorage(p.files);
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
p.files = normalizeProjectFilesForStorage(p.files);
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

function loadLibraryMetaCacheFromDB() {
return new Promise(resolve => {
try {
const request = db.transaction([LIB_META_STORE_NAME], 'readonly').objectStore(LIB_META_STORE_NAME).getAll();
request.onsuccess = e => {
libraryMetaCache = new Map();
const metas = e.target.result || [];
metas.forEach(meta => {
if (meta && meta.id !== undefined) {
setLibraryMetaLocal(meta);
}
});
libraryMetaLoaded = true;
resolve();
};
request.onerror = () => {
libraryMetaLoaded = true;
resolve();
};
} catch (e) {
libraryMetaLoaded = true;
resolve();
}
});
}
function ensureLibraryMetaLoaded() {
if (libraryMetaLoaded) return Promise.resolve();
if (libraryMetaLoadPromise) return libraryMetaLoadPromise;
libraryMetaLoadPromise = loadLibraryMetaCacheFromDB().finally(() => {
libraryMetaLoadPromise = null;
});
return libraryMetaLoadPromise;
}
function putLibraryMetaRecord(meta) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_META_STORE_NAME], 'readwrite').objectStore(LIB_META_STORE_NAME).put(meta);
request.onsuccess = () => resolve();
request.onerror = () => reject('Error saving library meta');
});
}
function deleteLibraryMetaRecord(id) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_META_STORE_NAME], 'readwrite').objectStore(LIB_META_STORE_NAME).delete(id);
request.onsuccess = () => resolve();
request.onerror = () => reject('Error deleting library meta');
});
}
async function saveLibraryMeta(meta) {
if (!meta || meta.id === undefined || meta.id === null) return;
setLibraryMetaLocal(meta);
await putLibraryMetaRecord(meta);
}
async function removeLibraryMeta(id) {
removeLibraryMetaLocal(id);
await deleteLibraryMetaRecord(id);
}
async function updateLibraryMetaOnly(id, changes = {}) {
const existing = getLibraryMeta(id) || { id };
const meta = {
id,
name: '',
type: 'file',
parentId: null,
date: 0,
size: 0,
known: true,
...existing,
...changes,
known: true
};
if (meta.parentId === undefined) meta.parentId = null;
await saveLibraryMeta(meta);
return meta;
}
function addLibraryRecord(record) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_STORE_NAME], 'readwrite').objectStore(LIB_STORE_NAME).add(record);
request.onsuccess = e => resolve(e.target.result);
request.onerror = () => reject('Error adding library record');
});
}
function putLibraryRecord(record) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_STORE_NAME], 'readwrite').objectStore(LIB_STORE_NAME).put(record);
request.onsuccess = e => resolve(e.target.result);
request.onerror = () => reject('Error putting library record');
});
}
function getLibraryRecord(id) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_STORE_NAME], 'readonly').objectStore(LIB_STORE_NAME).get(id);
request.onsuccess = e => resolve(e.target.result);
request.onerror = e => reject(e);
});
}
function deleteLibraryRecord(id) {
return new Promise((resolve, reject) => {
const request = db.transaction([LIB_STORE_NAME], 'readwrite').objectStore(LIB_STORE_NAME).delete(id);
request.onsuccess = () => resolve();
request.onerror = () => reject('Error deleting library record');
});
}
function getUniqueLibraryName(originalName, parentId, type = 'file') {
const safeParent = parentId ?? null;
const siblings = getLibraryChildren(safeParent).filter(meta => (meta.type || 'file') === type);
const names = new Set(siblings.map(meta => meta.name));
if (!names.has(originalName)) return originalName;
const nameParts = String(originalName).split('.');
const extension = (type === 'file' && nameParts.length > 1) ? '.' + nameParts.pop() : '';
const baseName = (type === 'file' && extension) ? nameParts.join('.') : String(originalName);
let counter = 1;
let candidate;
do {
candidate = `${baseName}(${counter})${extension}`;
counter++;
} while (names.has(candidate));
return candidate;
}
async function createLibraryFolder(name, parentId) {
const safeParent = parentId ?? null;
const finalName = getUniqueLibraryName(name, safeParent, 'folder');
const now = Date.now();
const record = {
type: 'folder',
name: finalName,
parentId: safeParent,
date: now
};
const id = await addLibraryRecord(record);
await saveLibraryMeta({
id,
name: finalName,
type: 'folder',
parentId: safeParent,
date: now,
size: 0,
known: true
});
return id;
}
async function addLibraryFileObject(file, parentId) {
const safeParent = parentId ?? null;
const finalName = getUniqueLibraryName(file.name, safeParent, 'file');
const extension = finalName.split('.').pop().toLowerCase();
const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));
const now = Date.now();
if (isText) {
const code = await new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = e => resolve(e.target.result);
reader.onerror = e => reject(e);
reader.readAsText(file);
});
const record = {
type: 'file',
name: finalName,
parentId: safeParent,
date: now,
isBinary: false,
code,
size: code.length
};
const id = await addLibraryRecord(record);
await saveLibraryMeta({
id,
name: finalName,
type: 'file',
parentId: safeParent,
date: now,
size: code.length,
known: true
});
return id;
}
const arrayBuffer = await new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = e => resolve(e.target.result);
reader.onerror = e => reject(e);
reader.readAsArrayBuffer(file);
});
const compressed = pako.gzip(new Uint8Array(arrayBuffer));
const mimeType = file.type || 'application/octet-stream';
const record = {
type: 'file',
name: finalName,
parentId: safeParent,
date: now,
isBinary: true,
mimeType,
content: compressed,
size: compressed.length
};
const id = await addLibraryRecord(record);
await saveLibraryMeta({
id,
name: finalName,
type: 'file',
parentId: safeParent,
date: now,
size: compressed.length,
known: true
});
return id;
}
async function updateLibraryTextContent(id, code) {
try {
const record = await getLibraryRecord(id);
if (!record || record.type === 'folder' || record.isBinary) return false;
record.code = code;
record.size = code.length;
record.date = Date.now();
await putLibraryRecord(record);
await updateLibraryMetaOnly(id, {
date: record.date,
size: record.size
});
return true;
} catch (e) {
console.error(e);
return false;
}
}
function collectLibraryDescendantIds(id) {
const ids = [];
const seen = new Set();
const collect = itemId => {
const key = String(itemId);
if (seen.has(key)) return;
seen.add(key);
ids.push(itemId);
getLibraryChildren(itemId).forEach(child => collect(child.id));
};
collect(id);
return ids;
}
async function deleteLibraryItemCompletely(id) {
const ids = collectLibraryDescendantIds(id);
if (!ids.length) return [];
await new Promise((resolve, reject) => {
const tx = db.transaction([LIB_STORE_NAME, LIB_META_STORE_NAME], 'readwrite');
const libStore = tx.objectStore(LIB_STORE_NAME);
const metaStore = tx.objectStore(LIB_META_STORE_NAME);
ids.forEach(itemId => {
libStore.delete(itemId);
metaStore.delete(itemId);
});
tx.oncomplete = () => resolve();
tx.onerror = () => reject(tx.error || 'Error deleting library item');
tx.onabort = () => reject(tx.error || 'Error deleting library item');
});
ids.forEach(itemId => removeLibraryMetaLocal(itemId));
return ids;
}
async function moveLibraryItem(id, newParentId) {
const safeParent = (newParentId === undefined || newParentId === null) ? null : newParentId;
const meta = getLibraryMeta(id);
if (!meta) return;
const currentParent = (meta.parentId === undefined || meta.parentId === null) ? null : meta.parentId;
if (String(currentParent ?? '') === String(safeParent ?? '')) return;
await updateLibraryMetaOnly(id, { parentId: safeParent });
}
async function hydrateProjectLibRefs(fileSet) {
const hydrated = {};
if (!fileSet) return hydrated;
for (const path in fileSet) {
let fileData = fileSet[path];
if (!fileData) continue;
if (typeof fileData === 'string') {
hydrated[path] = { isBinary: false, code: fileData };
continue;
}
if (fileData.libRef != null) {
const needsHydration = (fileData.isBinary && fileData.content === undefined) || (!fileData.isBinary && fileData.code === undefined);
if (needsHydration) {
try {
const record = await getLibraryRecord(fileData.libRef);
if (record && record.type !== 'folder') {
if (record.isBinary) {
hydrated[path] = {
libRef: fileData.libRef,
isBinary: true,
mimeType: record.mimeType || fileData.mimeType || 'application/octet-stream',
content: record.content
};
} else {
const code = record.code || '';
hydrated[path] = {
libRef: fileData.libRef,
isBinary: false,
code,
libOriginalCode: code
};
}
}
} catch (e) {
console.error(e);
}
continue;
} else if (!fileData.isBinary && fileData.libOriginalCode === undefined && fileData.code !== undefined) {
fileData = { ...fileData, libOriginalCode: fileData.code };
}
}
hydrated[path] = fileData;
}
return hydrated;
}
async function resolveProjectFilesForExport(fileSet) {
const resolved = {};
if (!fileSet) return resolved;
for (const path in fileSet) {
let fileData = fileSet[path];
if (!fileData) continue;
if (typeof fileData === 'string') {
resolved[path] = { isBinary: false, code: fileData };
continue;
}
if (fileData.libRef != null) {
const needsHydration = (fileData.isBinary && fileData.content === undefined) || (!fileData.isBinary && fileData.code === undefined);
if (needsHydration) {
try {
const record = await getLibraryRecord(fileData.libRef);
if (record && record.type !== 'folder') {
if (record.isBinary) {
resolved[path] = {
isBinary: true,
mimeType: record.mimeType || fileData.mimeType || 'application/octet-stream',
content: record.content
};
} else {
resolved[path] = {
isBinary: false,
code: record.code || ''
};
}
}
} catch (e) {
console.error(e);
}
continue;
}
}
if (fileData.isBinary) {
resolved[path] = {
isBinary: true,
mimeType: fileData.mimeType || 'application/octet-stream',
content: fileData.content !== undefined ? fileData.content : pako.gzip(new Uint8Array(0))
};
} else {
resolved[path] = {
isBinary: false,
code: fileData.code !== undefined ? fileData.code : ''
};
}
}
return resolved;
}
