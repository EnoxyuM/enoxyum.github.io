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

const DB_NAME = 'CodeEditorDB_Projects', DB_VERSION = 1, STORE_NAME = 'projects';

const URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const BASE = BigInt(URL_ALPHABET.length);
const ALPHABET_MAP = new Map(URL_ALPHABET.split('').map((c, i) => [c, BigInt(i)]));

let currentMediaBlobUrl = null;
let forceOpenAsText = new Set();
let altPressed = false, shiftAltPressed = false;
let showingEditor = false, showingConsole = false;