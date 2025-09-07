function compareVersions(vA, vB) {
    const parse = (vStr) => (vStr || 'v 0').substring(1).trim().split('.').map(Number);
    const partsA = parse(vA);
    const partsB = parse(vB);
    const len = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < len; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA !== numB) {
            return numB - numA; // Descending order
        }
    }
    return 0;
}

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
            name: name,
            order: Date.now()
        };
        const id = await saveCode(newProject);
        currentProjectId = id;
        localStorage.setItem('lastOpenedProjectId', currentProjectId);
        await loadSavedCodes();
    }
    updateProjectTitle();
}

async function createNewVersion() {
    if (currentProjectId === null) {
        showNotification("Cannot create a version for an unsaved project.");
        return;
    }

    if (activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
        files[activeFilePath].code = editor.getValue();
    }
    const filesToSave = {};
    for (const filepath in files) {
        if (files[filepath].isBinary) {
            filesToSave[filepath] = { isBinary: true, content: files[filepath].content, mimeType: files[filepath].mimeType };
        } else {
            filesToSave[filepath] = { code: files[filepath].code, isBinary: false };
        }
    }

    const allProjects = await getCodes();
    const currentProject = allProjects.find(p => p.id === currentProjectId);

    if (!currentProject) {
        showNotification("Could not find current project to version.");
        return;
    }

    const now = new Date();
    
    if (currentProject.parentId) {
        const parentId = currentProject.parentId;
        const versionsOfParent = allProjects.filter(p => p.parentId === parentId);

        const versionParts = currentProject.version.substring(1).trim().split('.').map(Number);
        const nextSiblingParts = [...versionParts];
        nextSiblingParts[nextSiblingParts.length - 1]++;
        const nextSiblingVersionString = 'v ' + nextSiblingParts.join('.');

        const nextSiblingExists = versionsOfParent.some(p => p.version === nextSiblingVersionString);

        let newVersionString;

        if (nextSiblingExists) {
            // Create a sub-version of the current version (e.g., v 1.1 -> v 1.1.1)
            let subVersionBase = currentProject.version;
            let subVersionCounter = 1;
            
            while (true) {
                const potentialVersion = `${subVersionBase}.${subVersionCounter}`;
                const exists = versionsOfParent.some(p => p.version === potentialVersion);
                if (!exists) {
                    newVersionString = potentialVersion;
                    break;
                }
                subVersionBase = potentialVersion; // For the next iteration, check v 1.1.1.1 and so on
                subVersionCounter = 1; // Reset counter for the new deeper level
            }
        } else {
            // Create the next logical sibling version (e.g., v 1.1 -> v 1.2)
            newVersionString = nextSiblingVersionString;
        }

        const newVersionProject = {
            date: now,
            createdDate: now,
            files: filesToSave,
            openTabs: openTabs,
            lastActiveFile: activeFilePath,
            name: currentProject.name,
            order: Date.now(),
            parentId: parentId,
            version: newVersionString
        };
        const newId = await saveCode(newVersionProject);
        await loadProject(newId);
        return;
    }

    // This part is for creating the first version from a main project
    const historicalVersion = {
        date: currentProject.date,
        createdDate: currentProject.createdDate,
        files: currentProject.files,
        openTabs: currentProject.openTabs,
        lastActiveFile: currentProject.lastActiveFile,
        name: currentProject.name,
        order: currentProject.order,
        parentId: currentProject.id,
        version: currentProject.version || 'v 1'
    };
    await saveCode(historicalVersion);

    let newVersionNumber;
    if (currentProject.version) {
        const currentNum = parseInt(currentProject.version.match(/\d+/)[0], 10) || 0;
        newVersionNumber = currentNum + 1;
    } else {
        newVersionNumber = 2;
    }
    
    currentProject.files = filesToSave;
    currentProject.openTabs = openTabs;
    currentProject.lastActiveFile = activeFilePath;
    currentProject.date = now;
    currentProject.version = `v ${newVersionNumber}`;

    await updateCode(currentProject);
    loadSavedCodes();
}

async function renderVersionList(parentId, allProjects) {
    versionListParentId = parentId;
    const versionListContainer = document.getElementById('version-list-container');
    
    const projectVersions = allProjects.filter(p => p.parentId === parentId && !p.inTrash)
                                     .sort((a, b) => new Date(b.date) - new Date(a.date));

    const parentProject = allProjects.find(p => p.id === parentId);

    if (projectVersions.length === 0 && !parentProject.version) {
        versionListContainer.style.display = 'none';
        versionListParentId = null;
        return;
    }

    versionListContainer.style.display = 'flex';
    versionListContainer.innerHTML = `<div id="version-list"></div>`;
    const versionList = versionListContainer.querySelector('#version-list');

    const displayList = [...projectVersions];
    
    displayList.sort((a, b) => compareVersions(a.version, b.version));

    displayList.forEach(project => {
        const button = document.createElement('button');
        button.dataset.projectId = project.id;
        
        const textContainer = document.createElement('span');
        textContainer.className = 'project-info';
    
        let nameHtml = '';
        if (project.name) {
            nameHtml += `<span class="name">${project.name}</span>`;
        }
    
        let detailsHtml = `<div class="project-details">`;
        detailsHtml += `<span class="project-time">${formatDate(new Date(project.date))}</span>`;
        if (project.version) {
            detailsHtml += `<span class="project-version">${project.version}</span>`;
        }
        detailsHtml += `</div>`;
        textContainer.innerHTML = nameHtml + detailsHtml;
        
        button.appendChild(textContainer);
        
        button.onclick = async () => {
            if (currentProjectId !== project.id) {
                await loadProject(project.id);
            }
        };

        button.oncontextmenu = e => {
            e.preventDefault();
            showInlineInput({
                initialValue: project.name || '',
                placeholder: 'Enter project name...',
                onSave: async (newName) => {
                    if (project.name === newName) return;
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
        versionList.appendChild(button);
    });
}

async function handleMainProjectDeletion(project, allProjects) {
    const versions = allProjects.filter(p => p.parentId === project.id && !p.inTrash);

    if (versions.length > 0) {
        versions.sort((a, b) => compareVersions(a.version, b.version));
        const projectToPromote = versions[0];
        const newParentId = projectToPromote.id;
        
        delete projectToPromote.parentId;

        const updates = [updateCode(projectToPromote)];
        versions.slice(1).forEach(sibling => {
            sibling.parentId = newParentId;
            updates.push(updateCode(sibling));
        });
        
        await Promise.all(updates);
    }
}

async function loadSavedCodes() {
    const allProjects = await getCodes();

    const versions = allProjects.filter(p => p.parentId);
    const mainProjects = allProjects.filter(p => !p.parentId && !p.inTrash);
    const trashedProjects = allProjects.filter(p => p.inTrash);
    const currentProject = allProjects.find(p => p.id === currentProjectId);

    if (currentSortMode === 'free') {
        mainProjects.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    } else {
        mainProjects.sort((a, b) => {
            const dateA = currentSortMode === 'created' ? (a.createdDate || a.date) : a.date;
            const dateB = currentSortMode === 'created' ? (b.createdDate || b.date) : b.date;
            return new Date(dateB) - new Date(dateA);
        });
    }
    
    menu.innerHTML = `<div id="menu-controls">
        <div id="menu-main-actions">
            <button id="saveBtn">New Project</button>
            <button id="newVerBtn" style="background-color: #007bff;">New Ver</button>
            <button id="exportToggleBtn">Export Projects</button>
            <button id="exportAllBtn">Export All</button>
            <button id="importProjectBtn">Import zip</button>
            <button id="importFolderBtn">Import Folder</button>
            <button id="shareUrlBtn">Share as URL</button>
            <button id="sharePreviewBtn">Share as Preview</button>
            <button id="sortBtn"></button>
            <button id="colorThemeBtn">Color Theme</button>
            <button id="basketBtn"></button>
        </div>
        <div id="fileInfo"></div>
    </div>
    <div id="project-list-wrapper">
        <div id="project-list"></div>
        <div id="basket-view" style="display:none;"></div>
    </div>
    <div id="version-list-container" style="display: none;"></div>`;
    const projectList = menu.querySelector('#project-list');
    const basketView = menu.querySelector('#basket-view');

    mainProjects.forEach(project => {
        const button = document.createElement('button');
        button.dataset.projectId = project.id;
        
        if (currentSortMode === 'free') button.draggable = true;

        const textContainer = document.createElement('span');
        textContainer.className = 'project-info';
    
        let nameHtml = '';
        if (project.name) nameHtml += `<span class="name">${project.name}</span>`;
        
        let detailsHtml = `<div class="project-details">`;
        detailsHtml += `<span class="project-time">${formatDate(new Date(project.date))}</span>`;
        if (project.version) {
            detailsHtml += `<span class="project-version">${project.version}</span>`;
        }
        detailsHtml += `</div>`;
    
        textContainer.innerHTML = nameHtml + detailsHtml;

        const arrow = document.createElement('span');
        arrow.innerHTML = '↓';
        arrow.className = 'export-arrow';
        arrow.title = 'Export project as .zip';
        arrow.addEventListener('click', e => { e.stopPropagation(); exportProjectAsZip(project.id); e.currentTarget.classList.add('exported'); setTimeout(() => e.currentTarget.classList.remove('exported'), 300000); });
        
        button.appendChild(textContainer);
        button.appendChild(arrow);
        
        button.onclick = async () => {
            if (currentProjectId !== project.id) await loadProject(project.id);
            else renderVersionList(project.id, await getCodes());
        };
        button.oncontextmenu = e => {
            e.preventDefault();
            showInlineInput({
                initialValue: project.name || '',
                placeholder: 'Enter project name...',
                onSave: async (newName) => {
                    if (project.name === newName) return;
                    
                    const allProjects = await getCodes();
                    const nameExists = allProjects.some(p => p.id !== project.id && !p.inTrash && p.name && p.name.toLowerCase() === newName.toLowerCase());
                    if (nameExists) {
                        showNotification('A project with that name already exists.'); return;
                    }
                    project.name = newName;
                    updateCode(project).then(() => { loadSavedCodes(); updateProjectTitle(); });
                }
            });
        };
        button.onmousedown = async (e) => {
            if (e.button === 1) {
                e.preventDefault();
                await handleMainProjectDeletion(project, await getCodes());

                project.inTrash = true;
                await updateCode(project);
                
                const updatedCurrentProject = (await getCodes()).find(p => p.id === currentProjectId);

                if (currentProjectId === project.id || (updatedCurrentProject && updatedCurrentProject.parentId === project.id)) {
                    currentProjectId = null;
                    localStorage.removeItem('lastOpenedProjectId');
                    loadFallbackProject();
                } else {
                    loadSavedCodes();
                }
            }
        };
        if (project.id === currentProjectId || (currentProject && currentProject.parentId === project.id)) button.classList.add('selected');
        projectList.appendChild(button);
    });

    if (currentProject) {
        const parentIdToShow = currentProject.parentId || currentProject.id;
        const hasVersions = versions.some(v => v.parentId === parentIdToShow);
        const parentIsMainProject = mainProjects.some(p => p.id === parentIdToShow);
        if (hasVersions || (parentIsMainProject && currentProject.version)) {
             renderVersionList(parentIdToShow, allProjects);
        }
    }

    document.getElementById('saveBtn').onclick = () => saveCurrentCode(false);
    document.getElementById('newVerBtn').onclick = createNewVersion;
    document.getElementById('exportToggleBtn').onclick = () => projectList.classList.toggle('show-export-arrows');
    document.getElementById('exportAllBtn').onclick = exportAllProjectsAsZip;
    document.getElementById('importProjectBtn').onclick = importProject;
    document.getElementById('importFolderBtn').onclick = importProjectFolder;
    document.getElementById('shareUrlBtn').onclick = () => generateShareableUrl('#p=');
    document.getElementById('sharePreviewBtn').onclick = () => generateShareableUrl('#t=');
    
    const sortBtn = document.getElementById('sortBtn');
    let sortModeText = 'Changed';
    if (currentSortMode === 'created') sortModeText = 'Created';
    if (currentSortMode === 'free') sortModeText = 'Free';
    sortBtn.textContent = `Sort by: ${sortModeText}`;
    
    sortBtn.onclick = () => {
        if (currentSortMode === 'created') currentSortMode = 'changed';
        else if (currentSortMode === 'changed') currentSortMode = 'free';
        else currentSortMode = 'created';
        localStorage.setItem('projectSortMode', currentSortMode);
        loadSavedCodes();
    };

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
    basketBtn.onmousedown = async (e) => {
        if (e.button === 1) {
            e.preventDefault();
            basket = [];
            saveBasket();
            
            const projectsFromDB = await getCodes();
            const trashed = projectsFromDB.filter(p => p.inTrash);
            
            for (const project of trashed) {
                if (!project.parentId) {
                    await handleMainProjectDeletion(project, projectsFromDB);
                }
            }

            const deletePromises = trashed.map(p => deleteCode(p.id));
            await Promise.all(deletePromises);
            
            loadSavedCodes();
        }
    };

    if (currentSortMode === 'free') {
        let draggingElement = null;

        const getProjectDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll('button[draggable="true"]:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        };

        projectList.addEventListener('dragstart', e => {
            const target = e.target.closest('button[draggable="true"]');
            if (target) {
                draggingElement = target;
                setTimeout(() => target.classList.add('dragging'), 0);
            }
        });

        projectList.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = getProjectDragAfterElement(projectList, e.clientY);
            if (draggingElement) {
                if (afterElement == null) projectList.appendChild(draggingElement);
                else projectList.insertBefore(draggingElement, afterElement);
            }
        });

        projectList.addEventListener('dragend', () => {
            if (draggingElement) {
                draggingElement.classList.remove('dragging');
                draggingElement = null;
            }
        });

        projectList.addEventListener('drop', async e => {
            e.preventDefault();
            if (!draggingElement) return;

            const projectButtons = [...projectList.querySelectorAll('button[data-project-id]')];
            const updatePromises = projectButtons.map((button, index) => {
                const projectId = parseInt(button.dataset.projectId, 10);
                const projectToUpdate = mainProjects.find(p => p.id === projectId);
                if (projectToUpdate && (projectToUpdate.order ?? -1) !== index) {
                    projectToUpdate.order = index;
                    return updateCode(projectToUpdate);
                }
                return null;
            }).filter(Boolean);

            if (updatePromises.length > 0) await Promise.all(updatePromises);
        });
    }

    updateFileInfo();
    const savedScroll = localStorage.getItem('projectListScrollPosition');
    if (savedScroll) setTimeout(() => { projectList.scrollTop = parseInt(savedScroll, 10); }, 0);
    projectList.addEventListener('scroll', () => localStorage.setItem('projectListScrollPosition', projectList.scrollTop));
}