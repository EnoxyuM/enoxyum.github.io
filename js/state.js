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
const DB_NAME = 'CodeEditorDB_Projects', DB_VERSION = 1, STORE_NAME = 'projects';
const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const BASE = BigInt(URL_ALPHABET.length);
const ALPHABET_MAP = new Map(URL_ALPHABET.split('').map((c, i) => [c, BigInt(i)]));
let currentMediaBlobUrl = null;
let forceOpenAsText = new Set();
let altPressed = false, shiftAltPressed = false;
let showingEditor = false, showingConsole = false;
let isDbDirty = true;
let cachedTotalSize = 0;
let cachedProjectsCount = 0;

let projectContentLoaded = false;
let projectMetaCache = new Map();
let projectMetaReady = localStorage.getItem('codium_project_meta_ready') === 'true';

function loadProjectMetaCache() {
    try {
        const arr = JSON.parse(localStorage.getItem('codium_project_meta_v1') || '[]');
        projectMetaCache = new Map();
        if (Array.isArray(arr)) {
            arr.forEach(meta => {
                if (meta && meta.id !== undefined) {
                    projectMetaCache.set(meta.id, meta);
                }
            });
        }
    } catch (e) {
        projectMetaCache = new Map();
    }
}

function saveProjectMetaCache() {
    try {
        localStorage.setItem('codium_project_meta_v1', JSON.stringify(Array.from(projectMetaCache.values())));
    } catch (e) {
        console.error('Could not save project meta cache', e);
    }
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

function addPlaceholderProjectMeta(id) {
    if (getProjectMeta(id)) return;

    projectMetaCache.set(id, {
        id,
        name: '',
        date: 0,
        createdDate: 0,
        version: undefined,
        parentId: undefined,
        inTrash: false,
        order: undefined,
        size: 0,
        known: false
    });
}

function upsertProjectMeta(record, known = true) {
    if (!record || record.id === undefined || record.id === null) return;

    const id = record.id;
    const existing = getProjectMeta(id) || {};

    const meta = {
        id,
        name: known && record.name !== undefined ? record.name : (existing.name || ''),
        date: known && record.date !== undefined ? record.date : (existing.date || 0),
        createdDate: known && record.createdDate !== undefined
            ? record.createdDate
            : (existing.createdDate || record.date || 0),
        version: known && record.version !== undefined ? record.version : existing.version,
        parentId: known && record.parentId !== undefined ? record.parentId : existing.parentId,
        inTrash: known && record.inTrash !== undefined ? record.inTrash : (existing.inTrash || false),
        order: known && record.order !== undefined ? record.order : existing.order,
        size: known && record.files ? computeProjectRecordSize(record) : (existing.size || 0),
        known: known ? true : (existing.known || false)
    };

    projectMetaCache.set(id, meta);
    saveProjectMetaCache();
}

function removeProjectMeta(id) {
    let deleted = false;

    if (projectMetaCache.has(id)) {
        projectMetaCache.delete(id);
        deleted = true;
    }

    const asNumber = Number(id);
    if (!Number.isNaN(asNumber) && projectMetaCache.has(asNumber)) {
        projectMetaCache.delete(asNumber);
        deleted = true;
    }

    const asString = String(id);
    if (projectMetaCache.has(asString)) {
        projectMetaCache.delete(asString);
        deleted = true;
    }

    if (deleted) {
        saveProjectMetaCache();
    }
}

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

function getKnownMainProjectMetaList() {
    return Array.from(projectMetaCache.values()).filter(meta => meta.known && !meta.parentId && !meta.inTrash);
}

loadProjectMetaCache();