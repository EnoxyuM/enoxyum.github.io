let editorProjectPromise = null;

function ensureEditorProjectLoaded() {
    if (projectContentLoaded || Object.keys(files).length > 0) {
        return Promise.resolve();
    }

    if (editorProjectPromise) {
        return editorProjectPromise;
    }

    editorProjectPromise = (async () => {
        const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');

        if (lastOpenedIdStr) {
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const lastMeta = getProjectMeta(lastOpenedId);

            if (lastMeta && lastMeta.inTrash) {
                localStorage.removeItem('lastOpenedProjectId');
            } else {
                try {
                    await loadProject(lastOpenedId);
                    return;
                } catch (e) {
                    console.error('Could not load last opened project:', e);
                    localStorage.removeItem('lastOpenedProjectId');
                }
            }
        }

        await loadFallbackProject();
    })().finally(() => {
        editorProjectPromise = null;
    });

    return editorProjectPromise;
}

if (!isPreviewMode) {
    setupCodeMirror();
    setupEventListeners();
    setupShortcuts();
    setupDragDrop();

    editorElement.style.display = 'none';
    document.getElementById('file-tabs').style.display = 'none';
    document.querySelector('.live-update-switch').style.display = 'none';
    consoleElem.style.display = 'none';

    scene.style.zIndex = '0';
    editorElement.style.pointerEvents = 'auto';
    scene.style.pointerEvents = 'none';
    showingEditor = true;

    openDB().then(async () => {
        await loadProjectMetaCacheFromDB();
        await ensureProjectMetaPlaceholders();

        loadBasket();

        if (await loadFromUrlHash()) {
            loadColors();

            editorElement.style.display = 'block';
            document.getElementById('file-tabs').style.display = 'flex';
            document.querySelector('.live-update-switch').style.display = 'block';

            editor.refresh();
            editor.focus();

            return;
        }

        loadColors();
        toggleLauncher();
    });
} else {
    setupPreviewMode();
}

function formatDate(d) {
    const s = (new Date() - d) / 1000;

    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;

    return `${Math.round(s / 86400)}d`;
}