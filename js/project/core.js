function initializeEditorWithFiles(fileSet, loadedOpenTabs) {
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

    if (openTabs.length === 0 && indexHtmlPath) {
        openTabs.push(indexHtmlPath);
    }
    
    if (openTabs.length === 0 && fileKeys.length > 0) {
        openTabs.push(fileKeys[0]);
    }

    activeFilePath = indexHtmlPath || (openTabs.length > 0 ? openTabs[0] : null);

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
    if (!isPreviewMode && liveUpdateToggle.checked) {
        updateScene();
    }
}

async function loadProject(projectId) {
    const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(projectId);
    request.onsuccess = async e => {
        const project = e.target.result;
        if (project && project.files) {
            currentProjectId = project.id;
            localStorage.setItem('lastOpenedProjectId', project.id);
            initializeEditorWithFiles(project.files, project.openTabs || []);
            await loadSavedCodes();
            updateProjectTitle();
        }
    };
}

function updateProjectTitle() {
    if (isPreviewMode) return;
    if (currentProjectId === null) {
        projectTitle.textContent = '📁 URL Project';
        projectTitle.title = 'Unsaved URL Project';
        checkOverflow();
        return;
    }
    getCodes().then(projects => {
        const currentProject = projects.find(p => p.id === currentProjectId);
        if (currentProject && currentProject.name) {
            projectTitle.textContent = `📁 ${currentProject.name}`;
            projectTitle.title = `Project: ${currentProject.name}`;
        } else {
            projectTitle.textContent = '📁 Project';
            projectTitle.title = 'Unnamed Project';
        }
        checkOverflow();
    });
}

function loadFallbackProject() {
    getCodes().then(projects => {
        if (projects.length > 0) {
            projects.sort((a, b) => { const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date; const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date; return new Date(dateB) - new Date(dateA); });
            loadProject(projects[0].id);
        } else {
            initializeEditorWithFiles({ 'index.html': { code: '', isBinary: false } }, ['index.html']);
        }
        loadColors();
    });
}