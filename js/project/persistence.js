async function saveCurrentCode(overwrite = false) {
    if (activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
        files[activeFilePath].code = editor.getValue();
    }
    
    const filesToSave = {};
    for (const filepath in files) {
        if (files[filepath].isBinary) {
            filesToSave[filepath] = {
                isBinary: true,
                content: files[filepath].content,
                mimeType: files[filepath].mimeType
            };
        } else {
            filesToSave[filepath] = {
                code: files[filepath].code,
                isBinary: false
            };
        }
    }
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
        const pad = (num, size) => String(num).padStart(size, '0');
        const name = `${pad(now.getDate(), 2)}.${pad(now.getMonth() + 1, 2)}.${now.getFullYear()} ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)} ${pad(now.getMilliseconds(), 3)}`;
        const newProject = {
            date: now,
            createdDate: now,
            files: filesToSave,
            openTabs: openTabs,
            name: name
        };
        const id = await saveCode(newProject);
        currentProjectId = id;
        localStorage.setItem('lastOpenedProjectId', currentProjectId);
        loadSavedCodes();
    }
    updateProjectTitle();
}

async function loadSavedCodes() {
    const savedProjects = await getCodes();
    savedProjects.sort((a, b) => {
        const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
        const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
        return new Date(dateB) - new Date(dateA);
    });
    menu.innerHTML = `<div id="menu-controls"><div id="menu-main-actions"><button id="saveBtn">New Project</button><button id="exportToggleBtn">Export Projects</button><button id="exportAllBtn">Export All</button><button id="importProjectBtn">Import zip</button><button id="importFolderBtn">Import Folder</button><button id="shareUrlBtn">Share as URL</button><button id="sharePreviewBtn">Share as Preview</button><button id="sortBtn"></button><button id="colorThemeBtn">Color Theme</button></div><div id="fileInfo"></div></div><div id="project-list"></div>`;
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
            showInlineInput({
                initialValue: project.name || '',
                placeholder: 'Enter project name...',
                onSave: async (newName) => {
                    if (project.name === newName) return;
                    
                    const allProjects = await getCodes();
                    const nameExists = allProjects.some(p => 
                        p.id !== project.id && 
                        p.name && 
                        p.name.toLowerCase() === newName.toLowerCase()
                    );

                    if (nameExists) {
                        showNotification('A project with that name already exists.');
                        return;
                    }

                    project.name = newName;
                    updateCode(project).then(() => {
                        loadSavedCodes();
                        updateProjectTitle();
                    });
                }
            });
        };
        button.onmousedown = e => {
            if (e.button === 1) {
                e.preventDefault();
                if (localStorage.getItem('lastOpenedProjectId') == project.id) localStorage.removeItem('lastOpenedProjectId');
                deleteCode(project.id).then(() => {
                    if (currentProjectId === project.id) { currentProjectId = null; initializeEditorWithFiles({ 'index.html': { code: '', isBinary: false } }, ['index.html']); }
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
    document.getElementById('importProjectBtn').onclick = importProject;
    document.getElementById('importFolderBtn').onclick = importProjectFolder;
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