function saveBasket() {
    localStorage.setItem('codium_basket', JSON.stringify(basket));
    const basketBtn = document.getElementById('basketBtn');
    if (basketBtn) {
        basketBtn.textContent = `Basket(${basket.length})`;
    }
}

function loadBasket() {
    const storedBasket = localStorage.getItem('codium_basket');
    if (storedBasket) {
        try {
            basket = JSON.parse(storedBasket);
        } catch(e) {
            console.error("Could not parse basket from localStorage", e);
            basket = [];
        }
    }
}

async function renderBasketView() {
    const basketView = menu.querySelector('#basket-view');
    const projectList = menu.querySelector('#project-list');
    if (!basketView || !projectList) return;
    
    projectList.style.display = 'none';
    basketView.style.display = 'block';
    basketView.innerHTML = '';

    const allProjects = await getCodes();
    const trashedProjects = allProjects.filter(p => p.inTrash);

    let contentAdded = false;

    if (trashedProjects.length > 0) {
        contentAdded = true;
        trashedProjects.forEach(project => {
            const button = document.createElement('button');
            const textContainer = document.createElement('span');
            let innerHtml = '';
            if (project.name) {
                innerHtml += `<span class="name">${project.name}</span>`;
            }
            innerHtml += formatDate(new Date(project.date));
            textContainer.innerHTML = innerHtml;
            button.appendChild(textContainer);
            
            button.onclick = async () => {
                project.inTrash = false;
                await updateCode(project);
                await renderBasketView();
                
                const allProjects = await getCodes();
                const trashedProjects = allProjects.filter(p => p.inTrash);
                const basketBtn = document.getElementById('basketBtn');
                if (basketBtn) {
                    basketBtn.textContent = `Basket(${basket.length + trashedProjects.length})`;
                }
            };
            basketView.appendChild(button);
        });
    }

    if (basket.length > 0) {
        contentAdded = true;
        basket.forEach((item, index) => {
            const button = document.createElement('button');
            let name = '', type = '';
            switch(item.type) {
                case 'file':
                    name = item.path;
                    type = 'File';
                    break;
                case 'folder':
                    name = item.path;
                    type = 'Folder';
                    break;
            }
            if(type){
                button.innerHTML = `<span class="name">${type}</span> ${name}`;
                button.onclick = () => restoreItem(index);
                basketView.appendChild(button);
            }
        });
    }

    if (!contentAdded) {
        basketView.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Basket is empty.</div>';
    }
}

function ensurePath(filePath) {
    const parts = filePath.split('/');
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        const placeholderPath = `${currentPath}/.p`;
        
        const pathExists = Object.keys(files).some(p => p.startsWith(currentPath + '/'));
        
        if (!pathExists && currentPath) {
            files[placeholderPath] = { code: '', doc: CodeMirror.Doc('', 'text/plain'), isBinary: false };
        }
    }
}

async function restoreItem(index) {
    const item = basket[index];
    if (!item) return;

    let itemName = item.path || (item.data && item.data.name);

    switch (item.type) {
        case 'file':
            if (files[item.path]) {
                showNotification(`Cannot restore: File '${item.path}' already exists.`);
                return;
            }
            ensurePath(item.path);
            const mode = getModeForFilename(item.path);
            files[item.path] = { ...item.data, doc: CodeMirror.Doc(item.data.code || '', mode) };
            renderAll();
            openFile(item.path);
            break;
            
        case 'folder':
            const existingFolder = Object.keys(files).some(p => p.startsWith(item.path + '/'));
            if (existingFolder) {
                showNotification(`Cannot restore: Folder '${item.path}' or its contents already exist.`);
                return;
            }
            ensurePath(item.path + '/.p');
            for (const filePath in item.files) {
                const fileData = item.files[filePath];
                const fileMode = getModeForFilename(filePath);
                files[filePath] = { ...fileData, doc: CodeMirror.Doc(fileData.code || '', fileMode) };
            }
            openFolders.add(item.path);
            renderAll();
            break;
    }

    basket.splice(index, 1);
    saveBasket();

    await renderBasketView();

    const allProjects = await getCodes();
    const trashedProjects = allProjects.filter(p => p.inTrash);
    const basketBtn = document.getElementById('basketBtn');
    if (basketBtn) {
        basketBtn.textContent = `Basket(${basket.length + trashedProjects.length})`;
    }

    showNotification(`Restored ${item.type} '${itemName}'.`);
}

async function saveActiveTab() {
    if (currentProjectId === null || !db) {
        return;
    }

    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(currentProjectId);

    getReq.onsuccess = e => {
        const project = e.target.result;
        if (project && project.lastActiveFile !== activeFilePath) {
            project.lastActiveFile = activeFilePath;
            updateCode(project).catch(err => console.error("Failed to save active tab state:", err));
        }
    };
}

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
        await new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const getReq = store.get(currentProjectId);

            getReq.onerror = reject;

            getReq.onsuccess = e => {
                const project = e.target.result;
                if (project) {
                    project.files = filesToSave;
                    project.openTabs = openTabs;
                    project.lastActiveFile = activeFilePath;
                    project.date = now;
                    
                    const updateReq = store.put(project);
                    updateReq.onsuccess = () => {
                        localStorage.setItem('lastOpenedProjectId', currentProjectId);
                        loadSavedCodes();
                        resolve();
                    };
                    updateReq.onerror = reject;
                } else {
                    resolve();
                }
            };
        });
    } else {
        const pad = (num, size) => String(num).padStart(size, '0');
        const name = `${pad(now.getDate(), 2)}.${pad(now.getMonth() + 1, 2)}.${now.getFullYear()} ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)} ${pad(now.getMilliseconds(), 3)}`;
        const newProject = {
            date: now,
            createdDate: now,
            files: filesToSave,
            openTabs: openTabs,
            lastActiveFile: activeFilePath,
            name: name
        };
        const id = await saveCode(newProject);
        currentProjectId = id;
        localStorage.setItem('lastOpenedProjectId', currentProjectId);
        await loadSavedCodes();
    }
    updateProjectTitle();
}

async function loadSavedCodes() {
    const allProjects = await getCodes();

    const savedProjects = allProjects.filter(p => !p.inTrash);
    const trashedProjects = allProjects.filter(p => p.inTrash);

    savedProjects.sort((a, b) => {
        const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
        const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
        return new Date(dateB) - new Date(dateA);
    });
    menu.innerHTML = `<div id="menu-controls"><div id="menu-main-actions"><button id="saveBtn">New Project</button><button id="exportToggleBtn">Export Projects</button><button id="exportAllBtn">Export All</button><button id="importProjectBtn">Import zip</button><button id="importFolderBtn">Import Folder</button><button id="shareUrlBtn">Share as URL</button><button id="sharePreviewBtn">Share as Preview</button><button id="sortBtn"></button><button id="colorThemeBtn">Color Theme</button><button id="basketBtn"></button></div><div id="fileInfo"></div></div><div id="project-list"></div><div id="basket-view" style="display:none; flex:1; overflow-y:auto; max-height: calc(80vh - 40px);"></div>`;
    const projectList = menu.querySelector('#project-list');
    const basketView = menu.querySelector('#basket-view');

    savedProjects.forEach(project => {
        const button = document.createElement('button');

        const textContainer = document.createElement('span');
        let innerHtml = '';
        if (project.name) {
            innerHtml += `<span class="name">${project.name}</span>`;
        }
        innerHtml += formatDate(new Date(project.date));
        textContainer.innerHTML = innerHtml;

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
                        !p.inTrash &&
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
            if (e.button === 1) { // MMB to move to basket
                e.preventDefault();
                project.inTrash = true;
                updateCode(project).then(() => {
                    if (currentProjectId === project.id) {
                        currentProjectId = null;
                        localStorage.removeItem('lastOpenedProjectId');
                        loadFallbackProject();
                    } else {
                        loadSavedCodes();
                    }
                });
            }
        };
        if (project.id === currentProjectId) button.classList.add('selected');
        projectList.appendChild(button);
    });
    document.getElementById('saveBtn').onclick = () => saveCurrentCode(false);
    document.getElementById('exportToggleBtn').onclick = () => {
        projectList.classList.toggle('show-export-arrows');
    };
    document.getElementById('exportAllBtn').onclick = exportAllProjectsAsZip;
    document.getElementById('importProjectBtn').onclick = importProject;
    document.getElementById('importFolderBtn').onclick = importProjectFolder;
    document.getElementById('shareUrlBtn').onclick = () => generateShareableUrl('#p=');
    document.getElementById('sharePreviewBtn').onclick = () => generateShareableUrl('#t=');
    const sortBtn = document.getElementById('sortBtn');
    sortBtn.textContent = `Sort by: ${currentSortMode==='created'?'Created':'Changed'}`;
    sortBtn.onclick = () => { currentSortMode = (currentSortMode === 'created') ? 'changed' : 'created'; localStorage.setItem('projectSortMode', currentSortMode); loadSavedCodes(); };
    document.getElementById('colorThemeBtn').onclick = () => { colorPicker.style.display = (colorPicker.style.display === 'none' || colorPicker.style.display === '') ? 'flex' : 'none'; };
    
    const basketBtn = document.getElementById('basketBtn');
    basketBtn.textContent = `Basket(${basket.length + trashedProjects.length})`;
    basketBtn.onclick = () => {
        const isBasketVisible = basketView.style.display !== 'none';
        if(isBasketVisible) {
            basketView.style.display = 'none';
            projectList.style.display = 'block';
            basketBtn.classList.remove('basket-active');
        } else {
            renderBasketView();
            basketBtn.classList.add('basket-active');
        }
    };
    basketBtn.onmousedown = (e) => { // MMB to empty basket
        if (e.button === 1) {
            e.preventDefault();
            // Empty file/folder basket
            basket = [];
            saveBasket();
            
            // Empty project basket
            const deletePromises = trashedProjects.map(p => deleteCode(p.id));
            Promise.all(deletePromises).then(() => {
                loadSavedCodes();
            });
        }
    };

    updateFileInfo();
    const savedScroll = localStorage.getItem('projectListScrollPosition');
    if (savedScroll) setTimeout(() => { projectList.scrollTop = parseInt(savedScroll, 10); }, 0);
    projectList.addEventListener('scroll', () => localStorage.setItem('projectListScrollPosition', projectList.scrollTop));
}
