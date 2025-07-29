function formatDate(d) {const s=(new Date()-d)/1000;if(s<60)return`${Math.round(s)}s`;if(s<3600)return`${Math.round(s/60)}m`;if(s<86400)return`${Math.round(s/3600)}h`;return`${Math.round(s/86400)}d`;}

function initializeEditorWithFiles(fileSet, loadedOpenTabs) {
    files = {};
    for (const filepath in fileSet) {
        const code = fileSet[filepath];
        const mode = getModeForFilename(filepath);
        files[filepath] = { code: code, doc: CodeMirror.Doc(code, mode) };
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
            editor.swapDoc(files[activeFilePath].doc);
            editor.setOption('mode', getModeForFilename(activeFilePath));
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

async function saveCurrentCode(overwrite = false) {
    if (activeFilePath && files[activeFilePath]) files[activeFilePath].code = editor.getValue();
    const filesToSave = {};
    for (const filepath in files) filesToSave[filepath] = files[filepath].code;
    const now = new Date();

    if (overwrite && currentProjectId !== null) {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(currentProjectId);
        getReq.onsuccess = e => {
            const project = e.target.result;
            if (project) {
                project.files = filesToSave;
                project.openTabs = openTabs;
                project.date = now;
                updateCode(project).then(loadSavedCodes);
                localStorage.setItem('lastOpenedProjectId', currentProjectId);
            }
        };
    } else {
        const newProject = { date: now, createdDate: now, files: filesToSave, openTabs: openTabs, name: '' };
        const id = await saveCode(newProject);
        currentProjectId = id;
        localStorage.setItem('lastOpenedProjectId', currentProjectId);
        loadSavedCodes();
    }
    updateProjectTitle();
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

async function loadSavedCodes() {
    const savedProjects = await getCodes();
    savedProjects.sort((a, b) => {
        const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
        const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
        return new Date(dateB) - new Date(dateA);
    });
    menu.innerHTML = `<div id="menu-controls"><div id="menu-main-actions"><button id="saveBtn">Save New Project</button><button id="exportToggleBtn">Export Projects</button><button id="exportAllBtn">Export All</button><button id="shareUrlBtn">Share as URL</button><button id="sharePreviewBtn">Share as Preview</button><button id="sortBtn"></button><button id="colorThemeBtn">Color Theme</button></div><div id="fileInfo"></div></div><div id="project-list"></div>`;
    const projectList = menu.querySelector('#project-list');
    savedProjects.forEach(project => {
        const button = document.createElement('button');
        const textContainer = document.createElement('span');
        if (project.name) textContainer.innerHTML = `<span class="name">${project.name}</span>`;
        textContainer.innerHTML += formatDate(new Date(project.date));
        const arrow = document.createElement('span');
        arrow.innerHTML = '↓';
        arrow.className = 'export-arrow';
        arrow.title = 'Export project as .zip';
        arrow.addEventListener('click', e => { e.stopPropagation(); exportProjectAsZip(project.id); e.currentTarget.classList.add('exported'); setTimeout(() => e.currentTarget.classList.remove('exported'), 300000); });
        button.appendChild(textContainer);
        button.appendChild(arrow);
        button.onclick = () => loadProject(project.id);
        button.oncontextmenu = e => {
            e.preventDefault();
            const name = prompt('Enter a name for this project:', project.name);
            if (name !== null) { project.name = name; updateCode(project).then(() => { loadSavedCodes(); updateProjectTitle(); }); }
        };
        button.onmousedown = e => {
            if (e.button === 1) {
                e.preventDefault();
                if (localStorage.getItem('lastOpenedProjectId') == project.id) localStorage.removeItem('lastOpenedProjectId');
                deleteCode(project.id).then(() => {
                    if (currentProjectId === project.id) { currentProjectId = null; initializeEditorWithFiles({ 'index.html': '' }, ['index.html']); }
                    loadSavedCodes(); updateProjectTitle(); updateFileInfo();
                });
            }
        };
        if (project.id === currentProjectId) button.classList.add('selected');
        projectList.appendChild(button);
    });
    document.getElementById('saveBtn').onclick = () => saveCurrentCode(false);
    document.getElementById('exportToggleBtn').onclick = () => projectList.classList.toggle('show-export-arrows');
    document.getElementById('exportAllBtn').onclick = exportAllProjectsAsZip;
    document.getElementById('shareUrlBtn').onclick = () => generateShareableUrl('#p=');
    document.getElementById('sharePreviewBtn').onclick = () => generateShareableUrl('#t=');
    const sortBtn = document.getElementById('sortBtn');
    sortBtn.textContent = `Sort by: ${currentSortMode==='created'?'Created':'Changed'}`;
    sortBtn.onclick = () => { currentSortMode = (currentSortMode === 'created') ? 'changed' : 'created'; localStorage.setItem('projectSortMode', currentSortMode); loadSavedCodes(); };
    document.getElementById('colorThemeBtn').onclick = () => { colorPicker.style.display = (colorPicker.style.display === 'none' || colorPicker.style.display === '') ? 'flex' : 'none'; };
    updateFileInfo();
    const savedScroll = localStorage.getItem('projectListScrollPosition');
    if (savedScroll) setTimeout(() => { projectList.scrollTop = parseInt(savedScroll, 10); }, 0);
    projectList.addEventListener('scroll', () => localStorage.setItem('projectListScrollPosition', projectList.scrollTop));
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
            initializeEditorWithFiles({ 'index.html': '' }, ['index.html']);
        }
        loadColors();
    });
}

async function exportProjectAsZip(projectId) {
    try {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(projectId);
        
        request.onsuccess = e => {
            const project = e.target.result;
            if (project && project.files) {
                const zip = new JSZip();
                for (const filename in project.files) {
                    if (filename.split('/').pop() === '.p') continue;
                    zip.file(filename, project.files[filename]);
                }
                
                zip.generateAsync({ type: "blob" })
                    .then(function(content) {
                        const a = document.createElement("a");
                        const url = URL.createObjectURL(content);
                        a.href = url;
                        const projectName = (project.name || `project-${project.id}`).replace(/[\\/:*?"<>|]/g, '_');
                        a.download = `${projectName}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    });
            } else {
                alert('Project data not found.');
            }
        };

        request.onerror = e => {
            console.error("Failed to get project for export:", e);
            alert("Error: Failed to get project data for export.");
        };
    } catch (error) {
        console.error("Export function error:", error);
        alert("An error occurred during export.");
    }
}
async function exportAllProjectsAsZip() {
    try {
        const allProjects = await getCodes();
        if (allProjects.length === 0) {
            alert("No saved projects to export.");
            return;
        }

        const zip = new JSZip();

        for (const project of allProjects) {
            if (project && project.files) {
                const folderName = (project.name || `project-${project.id}`).replace(/[\\/:*?"<>|]/g, '_');
                const projectFolder = zip.folder(folderName);
                
                for (const filename in project.files) {
                    if (filename.split('/').pop() === '.p') continue;
                    if(projectFolder) {
                       projectFolder.file(filename, project.files[filename]);
                    }
                }
            }
        }

        zip.generateAsync({ type: "blob" })
            .then(function(content) {
                const a = document.createElement("a");
                const url = URL.createObjectURL(content);
                a.href = url;
                a.download = `all_projects_export.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

    } catch (error) {
        console.error("Error exporting all projects:", error);
        alert("An error occurred while exporting all projects.");
    }
}