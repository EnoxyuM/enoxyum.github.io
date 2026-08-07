function initializeEditorWithFiles(fileSet, loadedOpenTabs, lastActiveFile) {
    projectContentLoaded = true;

    files = {};

    for (const filepath in fileSet) {
        const fileData = fileSet[filepath];

        if (fileData.isBinary) {
            files[filepath] = fileData;
        } else {
            const code = typeof fileData === 'string' ? fileData : fileData.code || '';
            const mode = getModeForFilename(filepath);
            files[filepath] = { code: code, doc: CodeMirror.Doc(code, mode), isBinary: false };
        }
    }

    openTabs = loadedOpenTabs.filter(f => files[f]);

    const fileKeys = Object.keys(files);
    const indexHtmlPath = fileKeys.find(key => key.toLowerCase() === 'index.html');

    if (lastActiveFile && files[lastActiveFile]) {
        activeFilePath = lastActiveFile;
    } else {
        if (openTabs.length === 0 && indexHtmlPath) {
            openTabs.push(indexHtmlPath);
        }

        if (openTabs.length === 0 && fileKeys.length > 0) {
            openTabs.push(fileKeys[0]);
        }

        activeFilePath = indexHtmlPath || (openTabs.length > 0 ? openTabs[0] : null);
    }

    if (activeFilePath && !openTabs.includes(activeFilePath)) {
        openTabs.unshift(activeFilePath);
    }

    if (activeFilePath && files[activeFilePath]) {
        if (!isPreviewMode) {
            if (files[activeFilePath].isBinary) {
                editor.swapDoc(CodeMirror.Doc('// Cannot edit binary file', 'text/plain'));
                editor.setOption("readOnly", true);
            } else {
                editor.setOption("readOnly", false);
                editor.swapDoc(files[activeFilePath].doc);
                editor.setOption('mode', getModeForFilename(activeFilePath));
            }
        }
    } else {
        activeFilePath = null;
        if (!isPreviewMode) {
            editor.swapDoc(CodeMirror.Doc('', 'text/plain'));
        }
    }

    renderAll();

    if (!isPreviewMode && liveUpdateToggle.checked && launcherView.style.display !== 'block') {
        updateScene();
    }
}

async function loadProject(projectId) {
    return new Promise((resolve, reject) => {
        const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(projectId);

        request.onsuccess = async e => {
            const project = e.target.result;

            if (project && project.files) {
                upsertProjectMeta(project, true);

                currentProjectId = project.id;
                localStorage.setItem('lastOpenedProjectId', project.id);

                initializeEditorWithFiles(project.files, project.openTabs || [], project.lastActiveFile);

                if (!isPreviewMode && menu.style.display === 'flex') {
                    await loadSavedCodes();
                }

                updateProjectTitle();
                resolve();
            } else {
                reject('Project not found');
            }
        };

        request.onerror = e => reject(e);
    });
}

function updateProjectTitle() {
    if (isPreviewMode) return;

    if (currentProjectId === null) {
        projectTitle.textContent = '📁 URL Project';
        projectTitle.title = 'Unsaved URL Project';
        checkOverflow();
        return;
    }

    const meta = getProjectMeta(currentProjectId);
    const name = meta && meta.name ? meta.name : '';
    const version = meta && meta.version ? meta.version : '';

    let titleText = name ? `📁 ${name}` : '📁 Project';
    let titleAttr = name ? `Project: ${name}` : 'Unnamed Project';

    if (version) {
        titleText += ` ${version}`;
        titleAttr += ` (${version})`;
    }

    projectTitle.textContent = titleText;
    projectTitle.title = titleAttr;
    checkOverflow();
}

function loadFallbackFromAllProjects() {
    return getCodes().then(projects => {
        if (projects.length > 0) {
            if (currentSortMode === 'free') {
                projects.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
            } else {
                projects.sort((a, b) => {
                    const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
                    const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
                    return new Date(dateB) - new Date(dateA);
                });
            }

            return loadProject(projects[0].id);
        } else {
            initializeEditorWithFiles({ 'index.html': { code: '', isBinary: false } }, ['index.html'], null);
            return Promise.resolve();
        }
    });
}

function loadFallbackProject() {
    const knownProjects = getKnownMainProjectMetaList();

    if (knownProjects.length > 0) {
        if (currentSortMode === 'free') {
            knownProjects.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
        } else {
            knownProjects.sort((a, b) => {
                const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
                const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
                return new Date(dateB) - new Date(dateA);
            });
        }

        return loadProject(knownProjects[0].id)
            .then(() => {
                loadColors();
            })
            .catch(() => {
                return loadFallbackFromAllProjects().then(() => {
                    loadColors();
                });
            });
    }

    return loadFallbackFromAllProjects().then(() => {
        loadColors();
    });
}