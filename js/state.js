// js/state.js
const isPreviewMode = location.hash === '#t' || location.hash.startsWith('#t=');
const editorElement = document.getElementById('editor');
const scene = document.getElementById('scene');
const consoleElem = document.getElementById('console');
const menu = document.getElementById('menu');
const projectTitle = document.getElementById('project-title');
const filePanel = document.getElementById('file-panel');
const tabsContainer = document.getElementById('tabs-container');
const tabsWrapper = document.getElementById('tabs-wrapper');
const colorPicker = document.getElementById('colorPicker');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const liveUpdateToggle = document.getElementById('liveUpdateToggle');
const contextMenu = document.getElementById('context-menu');
const runBtn = document.getElementById('run-btn');
const copyBtn = document.getElementById('copy-btn');
const pasteProjectBtn = document.getElementById('paste-project-btn');
const menuBtn = document.getElementById('menu-btn');
const inlineInputContainer = document.getElementById('inline-input-container');
const inlineInputField = document.getElementById('inline-input-field');
const launcherBtn = document.getElementById('launcher-btn');
const launcherView = document.getElementById('launcher-view');
let editor;
let files = {};
let openTabs = [];
let openFolders = new Set();
let activeFilePath = null;
let currentProjectId = null;
let currentSortMode = localStorage.getItem('projectSortMode') || 'created';
let versionListParentId = null;
const blobUrls = [];
let db;
let basket = [];
let isLauncherMode = false;
let showExportArrows = false;
const DB_NAME = 'CodeEditorDB_Projects';
const DB_VERSION = 3;
const STORE_NAME = 'projects';
const META_STORE_NAME = 'meta';
const LIB_STORE_NAME = 'library';
const LIB_META_STORE_NAME = 'libraryMeta';
const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const BASE = BigInt(URL_ALPHABET.length);
const ALPHABET_MAP = new Map(URL_ALPHABET.split('').map((c, i) => [c, BigInt(i)]));
const TEXT_EXTENSIONS = new Set(['txt', 'js', 'json', 'html', 'htm', 'css', 'xml', 'svg', 'md', 'csv', 'log', 'ini', 'yaml', 'yml', 'toml', 'sh', 'bash', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'ts', 'tsx', 'jsx']);
let currentMediaBlobUrl = null;
let forceOpenAsText = new Set();
let altPressed = false, shiftAltPressed = false;
let showingEditor = false, showingConsole = false;
let isDbDirty = true;
let cachedTotalSize = 0;
let cachedProjectsCount = 0;
let projectContentLoaded = false;
let projectMetaCache = new Map();
let projectMetaHydrated = localStorage.getItem('codium_meta_hydrated_v2') === 'true';
let metaHydrationPromise = null;

let libraryMetaCache = new Map();
let libraryMetaLoaded = false;
let libraryMetaLoadPromise = null;
let libraryOpenFolders = new Set();
let libraryCurrentFolder = null;

function getProjectMeta(id) {
if (projectMetaCache.has(id)) {
return projectMetaCache.get(id);
}
const asNumber = Number(id);
if (!Number.isNaN(asNumber) && projectMetaCache.has(asNumber)) {
return projectMetaCache.get(asNumber);
}
const asString = String(id);
if (projectMetaCache.has(asString)) {
return projectMetaCache.get(asString);
}
return null;
}
function setProjectMetaLocal(meta) {
if (!meta || meta.id === undefined || meta.id === null) return;
projectMetaCache.set(meta.id, meta);
}
function removeProjectMetaLocal(id) {
projectMetaCache.delete(id);
const asNumber = Number(id);
if (!Number.isNaN(asNumber)) {
projectMetaCache.delete(asNumber);
}
projectMetaCache.delete(String(id));
}
function getAllProjectMeta() {
return Array.from(projectMetaCache.values()).filter(meta => meta && meta.id !== undefined);
}
function getMainProjectMetaList() {
return getAllProjectMeta().filter(meta => !meta.parentId && !meta.inTrash);
}
function getVersionProjectMetaList(parentId) {
return getAllProjectMeta().filter(meta => {
return meta.parentId !== undefined &&
meta.parentId !== null &&
String(meta.parentId) === String(parentId) &&
!meta.inTrash;
});
}
function getTrashedProjectMetaList() {
return getAllProjectMeta().filter(meta => !!meta.inTrash);
}
function sortProjectMetaList(list) {
const arr = [...list];
if (currentSortMode === 'free') {
arr.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
} else {
arr.sort((a, b) => {
const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
return new Date(dateB || 0) - new Date(dateA || 0);
});
}
return arr;
}
function computeProjectRecordSize(project) {
let size = 0;
if (!project || !project.files) return size;
for (const path in project.files) {
const f = project.files[path];
if (!f) continue;
if (f.isBinary && f.content) {
size += f.content.byteLength || f.content.length || 0;
} else if (f.code) {
size += f.code.length;
}
}
return size;
}
function extractProjectMetaForSave(record) {
if (!record || record.id === undefined || record.id === null) return null;
return {
id: record.id,
name: record.name || '',
date: record.date || 0,
createdDate: record.createdDate || record.date || 0,
version: record.version ?? null,
parentId: record.parentId ?? null,
inTrash: !!record.inTrash,
order: record.order ?? null,
size: computeProjectRecordSize(record),
known: true
};
}
function extractProjectMetaForHydration(record) {
const base = extractProjectMetaForSave(record);
if (!base) return null;
const existing = getProjectMeta(record.id);
if (existing && existing.known) {
if (existing.name) {
base.name = existing.name;
}
if (existing.version !== undefined && existing.version !== null) {
base.version = existing.version;
}
if ('parentId' in existing) {
base.parentId = existing.parentId ?? null;
}
if (existing.inTrash !== undefined) {
base.inTrash = !!existing.inTrash;
}
if (existing.order !== undefined && existing.order !== null) {
base.order = existing.order;
}
}
return base;
}
function applyProjectMetaToRecord(record) {
if (!record || record.id === undefined || record.id === null) return record;
const meta = getProjectMeta(record.id);
if (!meta || !meta.known) return record;
if (meta.name !== undefined) record.name = meta.name;
if ('version' in meta) record.version = meta.version;
if ('parentId' in meta) record.parentId = meta.parentId;
if ('inTrash' in meta) record.inTrash = meta.inTrash;
if ('order' in meta) record.order = meta.order;
if (meta.createdDate) record.createdDate = meta.createdDate;
return record;
}

function getLibraryMeta(id) {
if (libraryMetaCache.has(id)) {
return libraryMetaCache.get(id);
}
const asNumber = Number(id);
if (!Number.isNaN(asNumber) && libraryMetaCache.has(asNumber)) {
return libraryMetaCache.get(asNumber);
}
const asString = String(id);
if (libraryMetaCache.has(asString)) {
return libraryMetaCache.get(asString);
}
return null;
}
function setLibraryMetaLocal(meta) {
if (!meta || meta.id === undefined || meta.id === null) return;
libraryMetaCache.set(meta.id, meta);
}
function removeLibraryMetaLocal(id) {
libraryMetaCache.delete(id);
const asNumber = Number(id);
if (!Number.isNaN(asNumber)) {
libraryMetaCache.delete(asNumber);
}
libraryMetaCache.delete(String(id));
}
function getAllLibraryMeta() {
return Array.from(libraryMetaCache.values()).filter(meta => meta && meta.id !== undefined);
}
function getLibraryChildren(parentId) {
const target = (parentId === null || parentId === undefined) ? null : String(parentId);
return getAllLibraryMeta().filter(meta => {
const p = (meta.parentId === null || meta.parentId === undefined) ? null : String(meta.parentId);
return p === target;
});
}