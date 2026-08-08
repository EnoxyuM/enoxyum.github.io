// js/ui/modals.js
if (typeof libraryOpenFolders === 'undefined') {
window.libraryOpenFolders = new Set();
}
if (typeof libraryCurrentFolder === 'undefined') {
window.libraryCurrentFolder = null;
}

function showInlineInput({ initialValue = '', placeholder = '', onSave, onCancel = () => {} }) {
inlineInputContainer.style.display = 'block';
inlineInputField.value = initialValue;
inlineInputField.placeholder = placeholder;
inlineInputField.focus();
inlineInputField.select();
const cleanup = () => {
inlineInputContainer.style.display = 'none';
inlineInputField.removeEventListener('keydown', handleKeydown);
inlineInputField.removeEventListener('blur', handleBlur);
};
const handleSave = () => {
const newValue = inlineInputField.value.trim();
if (newValue) {
onSave(newValue);
} else {
onCancel();
}
cleanup();
};
const handleCancel = () => {
onCancel();
cleanup();
};
const handleKeydown = (e) => {
if (e.key === 'Enter') {
e.preventDefault();
handleSave();
} else if (e.key === 'Escape') {
e.preventDefault();
handleCancel();
}
};
const handleBlur = () => {
handleSave();
};
inlineInputField.addEventListener('keydown', handleKeydown);
inlineInputField.addEventListener('blur', handleBlur);
}
function toggleMenu() {
if (menu.style.display === 'none' || menu.style.display === '') {
menu.style.display = 'flex';
loadSavedCodes();
showLibraryMenu();
} else {
menu.style.display = 'none';
colorPicker.style.display = 'none';
hideLibraryMenu();
}
}

let libraryMenuElem = null;
let draggedLibraryItemId = null;

function ensureLibraryMenu() {
if (libraryMenuElem) return libraryMenuElem;
if (isPreviewMode) return null;
libraryMenuElem = document.createElement('div');
libraryMenuElem.id = 'library-menu';
libraryMenuElem.innerHTML = `
<div id="library-header">📚 Library</div>
<div id="library-actions">
<button id="library-add-file-btn">+File</button>
<button id="library-add-folder-btn">+Folder</button>
</div>
<div id="library-list"></div>
`;
document.body.appendChild(libraryMenuElem);
const header = libraryMenuElem.querySelector('#library-header');
header.addEventListener('click', () => {
libraryCurrentFolder = null;
renderLibraryList();
});
const addFileBtn = libraryMenuElem.querySelector('#library-add-file-btn');
addFileBtn.addEventListener('click', () => {
const input = document.createElement('input');
input.type = 'file';
input.multiple = true;
input.onchange = async e => {
const list = Array.from(e.target.files || []);
if (!list.length) return;
try {
if (libraryCurrentFolder != null) {
libraryOpenFolders.add(libraryCurrentFolder);
}
for (const file of list) {
await addLibraryFileObject(file, libraryCurrentFolder);
}
renderLibraryList();
} catch (err) {
console.error(err);
}
};
input.click();
});
const addFolderBtn = libraryMenuElem.querySelector('#library-add-folder-btn');
addFolderBtn.addEventListener('click', () => {
showInlineInput({
placeholder: 'Enter new folder name...',
onSave: async name => {
try {
const id = await createLibraryFolder(name, libraryCurrentFolder);
if (libraryCurrentFolder != null) {
libraryOpenFolders.add(libraryCurrentFolder);
}
libraryOpenFolders.add(id);
renderLibraryList();
} catch (err) {
console.error(err);
}
}
});
});
window.addEventListener('resize', () => {
if (libraryMenuElem && libraryMenuElem.style.display === 'flex') {
positionLibraryMenu();
}
});
return libraryMenuElem;
}
function showLibraryMenu() {
if (isPreviewMode) return;
const el = ensureLibraryMenu();
if (!el) return;
el.style.display = 'flex';
ensureLibraryMetaLoaded()
.then(() => {
renderLibraryList();
})
.catch(console.error);
requestAnimationFrame(positionLibraryMenu);
setTimeout(positionLibraryMenu, 50);
setTimeout(positionLibraryMenu, 300);
}
function hideLibraryMenu() {
if (libraryMenuElem) {
libraryMenuElem.style.display = 'none';
}
}
function positionLibraryMenu() {
if (!libraryMenuElem || libraryMenuElem.style.display !== 'flex') return;
if (!menu || menu.style.display === 'none') return;
const menuRect = menu.getBoundingClientRect();
const width = libraryMenuElem.offsetWidth || 280;
const margin = 20;
let left = menuRect.right + margin;
if (left + width > window.innerWidth - 10) {
left = menuRect.left - width - margin;
}
if (left < 10) {
left = Math.max(10, window.innerWidth - width - 10);
}
let top = menuRect.top;
libraryMenuElem.style.left = left + 'px';
libraryMenuElem.style.top = top + 'px';
const maxHeight = Math.max(220, Math.min(window.innerHeight - 40, menuRect.height || window.innerHeight - 100));
libraryMenuElem.style.maxHeight = maxHeight + 'px';
const height = libraryMenuElem.offsetHeight;
if (top + height > window.innerHeight - 20) {
top = Math.max(20, window.innerHeight - height - 20);
}
libraryMenuElem.style.top = top + 'px';
}
async function renderLibraryList() {
if (!libraryMenuElem) return;
const list = libraryMenuElem.querySelector('#library-list');
if (!list) return;
if (!libraryMetaLoaded) {
list.innerHTML = '<div class="library-empty">Loading...</div>';
updateLibraryHeader();
try {
await ensureLibraryMetaLoaded();
} catch (e) {}
}
list.innerHTML = '';
list.ondragover = e => {
if (draggedLibraryItemId == null) return;
e.preventDefault();
e.dataTransfer.dropEffect = 'move';
list.classList.add('drag-over');
};
list.ondragleave = e => {
if (!list.contains(e.relatedTarget)) {
list.classList.remove('drag-over');
}
};
list.ondrop = async e => {
if (draggedLibraryItemId == null) return;
e.preventDefault();
list.classList.remove('drag-over');
const draggedId = draggedLibraryItemId;
try {
await moveLibraryItem(draggedId, null);
draggedLibraryItemId = null;
renderLibraryList();
} catch (err) {
console.error(err);
}
};
const container = document.createElement('div');
renderLibraryChildren(null, container, 0);
if (!container.hasChildNodes()) {
list.innerHTML = '<div class="library-empty">Library is empty.</div>';
} else {
list.appendChild(container);
}
updateLibraryHeader();
positionLibraryMenu();
}
function renderLibraryChildren(parentId, container, depth) {
if (depth > 50) return;
const children = getLibraryChildren(parentId);
const folders = children
.filter(meta => (meta.type || 'file') === 'folder')
.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
const filesList = children
.filter(meta => (meta.type || 'file') !== 'folder')
.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
folders.forEach(meta => {
container.appendChild(createLibraryItemButton(meta, depth));
if (libraryOpenFolders.has(meta.id)) {
renderLibraryChildren(meta.id, container, depth + 1);
}
});
filesList.forEach(meta => {
container.appendChild(createLibraryItemButton(meta, depth));
});
}
function isLibraryDescendant(childId, ancestorId) {
let current = getLibraryMeta(childId);
let guard = 0;
while (current && guard++ < 100) {
const parent = current.parentId === undefined ? null : current.parentId;
if (String(parent ?? '') === String(ancestorId)) return true;
current = getLibraryMeta(parent);
}
return false;
}
function canDropLibraryItem(draggedId, targetMeta) {
if (draggedId == null || !targetMeta) return true;
if (String(draggedId) === String(targetMeta.id)) return false;
const draggedMeta = getLibraryMeta(draggedId);
if (draggedMeta && (draggedMeta.type || 'file') === 'folder') {
if (isLibraryDescendant(targetMeta.id, draggedId)) return false;
}
return true;
}
function removeCurrentProjectFilesByLibraryIds(ids) {
if (!ids || !ids.length) return;
const idSet = new Set(ids.map(String));
let removed = false;
Object.keys(files).forEach(path => {
const fileData = files[path];
if (fileData && fileData.libRef != null && idSet.has(String(fileData.libRef))) {
const tabIndex = openTabs.indexOf(path);
if (tabIndex > -1) openTabs.splice(tabIndex, 1);
forceOpenAsText.delete(path);
delete files[path];
removed = true;
}
});
if (!removed) return;
if (activeFilePath && !files[activeFilePath]) {
activeFilePath = openTabs.length > 0 ? openTabs[0] : null;
}
if (activeFilePath && files[activeFilePath]) {
updateEditorView(activeFilePath);
saveActiveTab();
} else {
if (!isPreviewMode && typeof editor !== 'undefined' && editor) {
editor.swapDoc(CodeMirror.Doc('', 'text/plain'));
editor.setOption('readOnly', false);
}
}
renderAll();
if (liveUpdateToggle.checked) {
updateScene();
}
}
function createLibraryItemButton(meta, depth) {
const button = document.createElement('button');
button.className = 'library-item';
button.dataset.id = meta.id;
button.draggable = true;
const isFolder = (meta.type || 'file') === 'folder';
if (isFolder) button.classList.add('library-folder');
else button.classList.add('library-file');
if (meta.id === libraryCurrentFolder) button.classList.add('library-current');
button.style.paddingLeft = `${10 + depth * 15}px`;
const name = document.createElement('span');
name.className = 'library-name';
let icon = '';
if (isFolder) {
icon = libraryOpenFolders.has(meta.id) ? '▼ ' : '▶ ';
} else {
icon = /\.(png|jpe?g|gif|webp|svg|mp3|wav|ogg|mp4|webm)$/i.test(meta.name || '') ? '📦 ' : '📄 ';
}
name.textContent = icon + (meta.name || `Item ${meta.id}`);
const info = document.createElement('span');
info.className = 'library-info';
info.textContent = meta.date ? formatDate(new Date(meta.date)) : '';
button.appendChild(name);
button.appendChild(info);

button.addEventListener('dragstart', e => {
draggedLibraryItemId = meta.id;
e.dataTransfer.setData('text/plain', String(meta.id));
e.dataTransfer.effectAllowed = 'move';
setTimeout(() => button.classList.add('dragging'), 0);
});
button.addEventListener('dragend', () => {
button.classList.remove('dragging');
draggedLibraryItemId = null;
if (libraryMenuElem) {
libraryMenuElem.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}
});
button.addEventListener('dragover', e => {
if (draggedLibraryItemId == null) return;
e.stopPropagation();
if (canDropLibraryItem(draggedLibraryItemId, meta)) {
e.preventDefault();
e.dataTransfer.dropEffect = 'move';
button.classList.add('drag-over');
} else {
button.classList.remove('drag-over');
}
});
button.addEventListener('dragleave', e => {
if (!button.contains(e.relatedTarget)) {
button.classList.remove('drag-over');
}
});
button.addEventListener('drop', async e => {
if (draggedLibraryItemId == null) return;
e.preventDefault();
e.stopPropagation();
button.classList.remove('drag-over');
const draggedId = draggedLibraryItemId;
if (!canDropLibraryItem(draggedId, meta)) return;
const newParentId = isFolder ? meta.id : (meta.parentId ?? null);
try {
await moveLibraryItem(draggedId, newParentId);
if (newParentId != null) {
libraryOpenFolders.add(newParentId);
}
draggedLibraryItemId = null;
renderLibraryList();
} catch (err) {
console.error(err);
}
});

button.onclick = async e => {
if (e.button !== 0) return;
if (isFolder) {
if (libraryOpenFolders.has(meta.id)) {
libraryOpenFolders.delete(meta.id);
} else {
libraryOpenFolders.add(meta.id);
}
libraryCurrentFolder = meta.id;
renderLibraryList();
} else {
await addLibraryFileToCurrentProject(meta.id);
}
};
button.oncontextmenu = e => {
e.preventDefault();
showInlineInput({
initialValue: meta.name || '',
placeholder: 'Enter name...',
onSave: async newName => {
if (!newName || newName === meta.name) return;
await updateLibraryMetaOnly(meta.id, { name: newName });
renderLibraryList();
}
});
};
button.onmousedown = async e => {
if (e.button === 1) {
e.preventDefault();
try {
const deletedIds = await deleteLibraryItemCompletely(meta.id);
deletedIds.forEach(id => libraryOpenFolders.delete(id));
if (libraryCurrentFolder != null && !getLibraryMeta(libraryCurrentFolder)) {
libraryCurrentFolder = null;
}
removeCurrentProjectFilesByLibraryIds(deletedIds);
renderLibraryList();
} catch (err) {
console.error(err);
}
}
};
return button;
}
function updateLibraryHeader() {
if (!libraryMenuElem) return;
const header = libraryMenuElem.querySelector('#library-header');
if (!header) return;
const path = getLibraryFolderPath(libraryCurrentFolder);
header.textContent = path ? `📚 Library / ${path}` : '📚 Library';
header.title = path ? `Current folder: ${path}. Click to go to root` : 'Library root';
}
function getLibraryFolderPath(id) {
const parts = [];
let current = getLibraryMeta(id);
let guard = 0;
while (current && guard++ < 100) {
parts.unshift(current.name || `Item ${current.id}`);
current = getLibraryMeta(current.parentId);
}
return parts.join('/');
}
function getUniqueProjectPath(name) {
const clean = String(name || 'file').replace(/^\/+/, '');
if (!files[clean]) return clean;
const parts = clean.split('.');
const extension = parts.length > 1 ? '.' + parts.pop() : '';
const base = parts.join('.') || clean;
let counter = 1;
let candidate;
do {
candidate = `${base}(${counter})${extension}`;
counter++;
} while (files[candidate]);
return candidate;
}
async function addLibraryFileToCurrentProject(libraryId) {
try {
const meta = getLibraryMeta(libraryId);
if (!meta || (meta.type || 'file') === 'folder') return;
const record = await getLibraryRecord(libraryId);
if (!record || record.type === 'folder') return;
const targetPath = getUniqueProjectPath(record.name || meta.name || 'file');
if (record.isBinary) {
files[targetPath] = {
isBinary: true,
mimeType: record.mimeType || 'application/octet-stream',
content: record.content,
libRef: libraryId
};
} else {
const code = record.code || '';
files[targetPath] = {
code,
doc: CodeMirror.Doc(code, getModeForFilename(targetPath)),
isBinary: false,
libRef: libraryId,
libOriginalCode: code
};
}
openFile(targetPath);
renderAll();
if (liveUpdateToggle.checked) {
updateScene();
}
} catch (e) {
console.error(e);
}
}

let draggedLauncherItem = null;
const GRID_CELL_W = 100;
const GRID_CELL_H = 120;
function removeLauncherShortcut(id) {
const shortcuts = getLauncherShortcuts().filter(s => {
return s.id !== id && String(s.id) !== String(id);
});
saveLauncherShortcuts(shortcuts);
if (launcherView.style.display === 'block') {
renderLauncher();
}
}
async function renderLauncher() {
const shortcuts = getLauncherShortcuts();
const maxCols = Math.floor(window.innerWidth / GRID_CELL_W);
const gridWidth = maxCols * GRID_CELL_W;
const gridOffsetX = Math.max(0, (window.innerWidth - gridWidth) / 2);
if (!launcherView.getAttribute('data-drop-init')) {
launcherView.setAttribute('data-drop-init', 'true');
window.addEventListener('resize', () => {
if (launcherView.style.display === 'block') {
renderLauncher();
}
});
launcherView.ondragover = (e) => {
e.preventDefault();
e.dataTransfer.dropEffect = 'move';
};
launcherView.ondrop = (e) => {
e.preventDefault();
if (!draggedLauncherItem) return;
const curMaxCols = Math.floor(window.innerWidth / GRID_CELL_W);
const curGridWidth = curMaxCols * GRID_CELL_W;
const curOffsetX = Math.max(0, (window.innerWidth - curGridWidth) / 2);
const x = Math.max(0, Math.floor((e.clientX - curOffsetX) / GRID_CELL_W));
const y = Math.max(0, Math.floor(e.clientY / GRID_CELL_H));
const maxRows = Math.floor(window.innerHeight / GRID_CELL_H);
if (x >= curMaxCols) return;
if (y >= maxRows) return;
const currentShortcuts = getLauncherShortcuts();
const targetItemIndex = currentShortcuts.findIndex(s => s.x === x && s.y === y);
const sourceItemIndex = currentShortcuts.findIndex(s => s.id === draggedLauncherItem.id);
if (sourceItemIndex === -1) return;
if (targetItemIndex > -1 && targetItemIndex !== sourceItemIndex) {
const targetItem = currentShortcuts[targetItemIndex];
targetItem.x = draggedLauncherItem.x;
targetItem.y = draggedLauncherItem.y;
currentShortcuts[sourceItemIndex].x = x;
currentShortcuts[sourceItemIndex].y = y;
} else {
currentShortcuts[sourceItemIndex].x = x;
currentShortcuts[sourceItemIndex].y = y;
}
saveLauncherShortcuts(currentShortcuts);
renderLauncher();
draggedLauncherItem = null;
};
}
const children = Array.from(launcherView.children);
const childrenById = new Map();
children.forEach(c => {
if (c.dataset.id) childrenById.set(c.dataset.id, c);
});
const touchedIds = new Set();
shortcuts.forEach(item => {
const itemIdStr = String(item.id);
touchedIds.add(itemIdStr);
let container = childrenById.get(itemIdStr);
let isNew = false;
if (!container) {
isNew = true;
container = document.createElement('div');
container.className = 'app-icon-container';
container.draggable = true;
container.dataset.id = itemIdStr;
launcherView.appendChild(container);
container.addEventListener('dragstart', (e) => {
const currentShortcuts = getLauncherShortcuts();
const freshItem = currentShortcuts.find(s => String(s.id) === itemIdStr);
draggedLauncherItem = freshItem || item;
const rect = container.getBoundingClientRect();
e.dataTransfer.setData('text/plain', JSON.stringify({
id: item.id,
offsetX: e.clientX - rect.left,
offsetY: e.clientY - rect.top
}));
e.dataTransfer.effectAllowed = 'move';
setTimeout(() => container.classList.add('dragging'), 0);
});
container.addEventListener('dragend', () => {
container.classList.remove('dragging');
draggedLauncherItem = null;
});
}
container.style.left = (item.x * GRID_CELL_W + gridOffsetX) + 'px';
container.style.top = (item.y * GRID_CELL_H) + 'px';
if (item.id === 'editor') {
if (isNew || container.getAttribute('data-type') !== 'editor') {
container.setAttribute('data-type', 'editor');
container.innerHTML = `
<div class="app-icon editor-icon">📝</div>
<div class="app-name">Editor</div>
`;
container.onclick = async () => {
isLauncherMode = false;
launcherView.style.display = 'none';
editorElement.style.display = 'block';
document.getElementById('file-tabs').style.display = 'flex';
document.querySelector('.live-update-switch').style.display = 'block';
try {
if (typeof ensureEditorProjectLoaded === 'function') {
await ensureEditorProjectLoaded();
}
} catch (e) {
console.error('Could not load editor project:', e);
}
if (scene) scene.style.pointerEvents = 'none';
editor.refresh();
if (liveUpdateToggle.checked) {
updateScene();
}
};
container.onmousedown = null;
}
} else {
const meta = getProjectMeta(item.id);
if (!meta) {
container.style.display = 'none';
return;
}
if (meta.inTrash) {
container.style.display = 'none';
return;
}
container.style.display = 'flex';
const projectName = meta.name || `Project ${item.id}`;
if (container.getAttribute('data-name') !== projectName || isNew) {
container.setAttribute('data-name', projectName);
const initials = (projectName || '?').substring(0, 2).toUpperCase();
const numericId = Number(item.id);
const hue = (Number.isFinite(numericId) ? numericId : 0) * 137.508 % 360;
const colorStyle = `hsl(${hue}, 60%, 40%)`;
container.innerHTML = `
<div class="app-icon" style="background-color: ${colorStyle}">${initials}</div>
<div class="app-name">${projectName}</div>
`;
}
container.onmousedown = (e) => {
if (e.button === 1) {
e.preventDefault();
e.stopPropagation();
removeLauncherShortcut(item.id);
}
};
container.onclick = async () => {
try {
launcherView.style.display = 'none';
isLauncherMode = true;
editorElement.style.display = 'none';
document.getElementById('file-tabs').style.display = 'none';
document.querySelector('.live-update-switch').style.display = 'none';
menu.style.display = 'none';
hideLibraryMenu();
await loadProject(item.id);
updateScene();
scene.style.zIndex = '5';
scene.style.pointerEvents = 'auto';
scene.focus();
} catch (e) {
console.error("Launcher error:", e);
showNotification("Failed to launch project");
removeLauncherShortcut(item.id);
isLauncherMode = false;
launcherView.style.display = 'block';
editorElement.style.display = 'none';
document.getElementById('file-tabs').style.display = 'none';
document.querySelector('.live-update-switch').style.display = 'none';
renderLauncher();
}
};
}
});
childrenById.forEach((node, id) => {
if (!touchedIds.has(id)) {
node.remove();
}
});
}
async function toggleLauncher() {
const isVisible = launcherView.style.display === 'block';
if (isVisible) {
if (isLauncherMode) {
launcherView.style.display = 'none';
scene.focus();
} else {
launcherView.style.display = 'none';
editorElement.style.display = 'block';
document.getElementById('file-tabs').style.display = 'flex';
document.querySelector('.live-update-switch').style.display = 'block';
try {
if (typeof ensureEditorProjectLoaded === 'function') {
await ensureEditorProjectLoaded();
}
} catch (e) {
console.error('Could not load editor project:', e);
}
editor.refresh();
editor.focus();
}
} else {
editorElement.style.display = 'none';
document.getElementById('file-tabs').style.display = 'none';
document.querySelector('.live-update-switch').style.display = 'none';
menu.style.display = 'none';
colorPicker.style.display = 'none';
hideLibraryMenu();
launcherView.style.display = 'block';
renderLauncher();
}
}
