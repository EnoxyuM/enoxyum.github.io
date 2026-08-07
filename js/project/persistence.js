function compareVersions(vA, vB) {
    const parse = (vStr) => (vStr || 'v 0').substring(1).trim().split('.').map(Number);
    const partsA = parse(vA);
    const partsB = parse(vB);
    const len = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < len; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA !== numB) {
            return numB - numA;
        }
    }

    return 0;
}

function updateBasketButtonText() {
    const basketBtn = document.getElementById('basketBtn');
    if (!basketBtn) return;

    const trashedCount = getTrashedProjectMetaList().length;
    basketBtn.textContent = `Basket(${basket.length + trashedCount})`;
}

function saveBasket() {
    localStorage.setItem('codium_basket', JSON.stringify(basket));
    updateBasketButtonText();
}

function loadBasket() {
    const storedBasket = localStorage.getItem('codium_basket');

    if (storedBasket) {
        try {
            basket = JSON.parse(storedBasket);
        } catch (e) {
            console.error("Could not parse basket from localStorage", e);
            basket = [];
        }
    }
}

function saveLauncherShortcuts(shortcuts) {
    localStorage.setItem('codium_launcher_shortcuts_v2', JSON.stringify(shortcuts));
}

function getLauncherShortcuts() {
    try {
        let data = JSON.parse(localStorage.getItem('codium_launcher_shortcuts_v2'));

        if (!data) {
            const oldData = JSON.parse(localStorage.getItem('codium_launcher_shortcuts'));

            if (Array.isArray(oldData)) {
                data = oldData.map((id, index) => ({
                    id: id,
                    x: index % 6,
                    y: Math.floor(index / 6)
                }));

                if (!data.some(i => i.id === 'editor')) {
                    data.unshift({ id: 'editor', x: 0, y: 0 });
                }
            } else {
                data = [{ id: 'editor', x: 0, y: 0 }];
            }

            saveLauncherShortcuts(data);
        }

        return data;
    } catch (e) {
        return [{ id: 'editor', x: 0, y: 0 }];
    }
}

function addProjectToLauncher(projectId) {
    const shortcuts = getLauncherShortcuts();

    if (shortcuts.some(s => s.id === projectId)) return false;

    let x = 0, y = 0;

    while (true) {
        if (!shortcuts.some(s => s.x === x && s.y === y)) {
            break;
        }

        y++;

        if (y > 10) {
            y = 0;
            x++;
        }
    }

    shortcuts.push({ id: projectId, x, y });
    saveLauncherShortcuts(shortcuts);

    return true;
}

async function renderBasketView() {
    const basketView = menu.querySelector('#basket-view');
    const projectList = menu.querySelector('#project-list');

    if (!basketView || !projectList) return;

    projectList.style.display = 'none';
    basketView.style.display = 'block';
    basketView.innerHTML = '';

    const trashedProjects = getTrashedProjectMetaList();
    let contentAdded = false;

    if (trashedProjects.length > 0) {
        contentAdded = true;

        trashedProjects.forEach(meta => {
            const button = document.createElement('button');
            const textContainer = document.createElement('span');

            const name = meta.name || `Project ${meta.id}`;
            const dateText = meta.known && meta.date ? formatDate(new Date(meta.date)) : '';

            textContainer.innerHTML = `<span class="name">${name}</span> ${dateText}`;
            button.appendChild(textContainer);

            button.onclick = async () => {
                await updateProjectMetaOnly(meta.id, { inTrash: false });
                await renderBasketView();
                updateBasketButtonText();
            };

            basketView.appendChild(button);
        });
    }

    if (basket.length > 0) {
        contentAdded = true;

        basket.forEach((item, index) => {
            const button = document.createElement('button');

            let name = '';
            let type = '';

            switch (item.type) {
                case 'file':
                    name = item.path;
                    type = 'File';
                    break;
                case 'folder':
                    name = item.path;
                    type = 'Folder';
                    break;
            }

            if (type) {
                button.innerHTML = `<span class="name">${type}</span> ${name}`;
                button.onclick = () => restoreItem(index);
                basketView.appendChild(button);
            }
        });
    }

    if (!contentAdded) {
        basketView.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Basket is empty.</div>';
    }

    updateBasketButtonText();
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

    const itemName = item.path || (item.data && item.data.name);

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
    updateBasketButtonText();

    showNotification(`Restored ${item.type} '${itemName}'.`);
}

async function saveActiveTab() {
    if (currentProjectId === null) return;

    try {
        localStorage.setItem(`codium_last_active_file_${currentProjectId}`, activeFilePath || '');
    } catch (e) {
        console.error('Could not save active tab:', e);
    }
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
        const meta = getProjectMeta(currentProjectId) || {};

        const project = {
            id: currentProjectId,
            date: now,
            createdDate: meta.createdDate || meta.date || now,
            files: filesToSave,
            openTabs: openTabs,
            lastActiveFile: activeFilePath,
            name: meta.name || '',
            order: meta.order ?? Date.now(),
            version: meta.version ?? null,
            parentId: meta.parentId ?? null,
            inTrash: !!meta.inTrash
        };

        await updateCode(project);

        localStorage.setItem('lastOpenedProjectId', currentProjectId);

        if (menu.style.display === 'flex') {
            await loadSavedCodes();
        }
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
            order: Date.now(),
            version: null,
            parentId: null,
            inTrash: false
        };

        const id = await saveCode(newProject);

        currentProjectId = id;
        localStorage.setItem('lastOpenedProjectId', currentProjectId);

        if (menu.style.display === 'flex') {
            await loadSavedCodes();
        }
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

    const currentProject = await getProjectRecord(currentProjectId);

    if (!currentProject) {
        showNotification("Could not find current project to version.");
        return;
    }

    applyProjectMetaToRecord(currentProject);

    const now = new Date();

    if (currentProject.parentId) {
        const parentId = currentProject.parentId;
        const versionsOfParent = getVersionProjectMetaList(parentId);

        const currentVersion = currentProject.version || 'v 0';
        const versionParts = currentVersion.substring(1).trim().split('.').map(Number);

        const nextSiblingParts = [...versionParts];
        nextSiblingParts[nextSiblingParts.length - 1]++;

        const nextSiblingVersionString = 'v ' + nextSiblingParts.join('.');
        const nextSiblingExists = versionsOfParent.some(p => p.version === nextSiblingVersionString);

        let newVersionString;

        if (nextSiblingExists) {
            let subVersionBase = currentVersion;
            let subVersionCounter = 1;

            while (true) {
                const potentialVersion = `${subVersionBase}.${subVersionCounter}`;
                const exists = versionsOfParent.some(p => p.version === potentialVersion);

                if (!exists) {
                    newVersionString = potentialVersion;
                    break;
                }

                subVersionBase = potentialVersion;
                subVersionCounter = 1;
            }
        } else {
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
            version: newVersionString,
            inTrash: false
        };

        const newId = await saveCode(newVersionProject);
        await loadProject(newId);

        return;
    }

    const historicalVersion = {
        date: currentProject.date,
        createdDate: currentProject.createdDate || currentProject.date,
        files: currentProject.files,
        openTabs: currentProject.openTabs,
        lastActiveFile: currentProject.lastActiveFile,
        name: currentProject.name,
        order: currentProject.order,
        parentId: currentProject.id,
        version: currentProject.version || 'v 1',
        inTrash: false
    };

    await saveCode(historicalVersion);

    let newVersionNumber;

    if (currentProject.version) {
        const currentNum = parseInt(currentProject.version.match(/\d+/)[0], 10) || 0;
        newVersionNumber = currentNum + 1;
    } else {
        newVersionNumber = 2;
    }

    const updatedProject = {
        id: currentProject.id,
        date: now,
        createdDate: currentProject.createdDate || currentProject.date,
        files: filesToSave,
        openTabs: openTabs,
        lastActiveFile: activeFilePath,
        name: currentProject.name,
        order: currentProject.order,
        version: `v ${newVersionNumber}`,
        parentId: null,
        inTrash: false
    };

    await updateCode(updatedProject);

    if (menu.style.display === 'flex') {
        await loadSavedCodes();
    }
}

async function renderVersionList(parentId) {
    versionListParentId = parentId;

    const versionListContainer = document.getElementById('version-list-container');
    const projectVersions = getVersionProjectMetaList(parentId)
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const parentMeta = getProjectMeta(parentId);

    if (projectVersions.length === 0 && (!parentMeta || !parentMeta.version)) {
        versionListContainer.style.display = 'none';
        versionListParentId = null;
        return;
    }

    versionListContainer.style.display = 'flex';
    versionListContainer.innerHTML = `<div id="version-list"></div>`;

    const versionList = versionListContainer.querySelector('#version-list');

    const displayList = [...projectVersions];
    displayList.sort((a, b) => compareVersions(a.version, b.version));

    displayList.forEach(meta => {
        const button = document.createElement('button');
        button.dataset.projectId = meta.id;

        const textContainer = document.createElement('span');
        textContainer.className = 'project-info';

        const name = meta.name || `Project ${meta.id}`;
        const dateText = meta.known && meta.date ? formatDate(new Date(meta.date)) : '';

        let detailsHtml = `<div class="project-details">`;
        detailsHtml += `<span class="project-time">${dateText}</span>`;

        if (meta.version) {
            detailsHtml += `<span class="project-version">${meta.version}</span>`;
        }

        detailsHtml += `</div>`;

        textContainer.innerHTML = `<span class="name">${name}</span>` + detailsHtml;
        button.appendChild(textContainer);

        button.onclick = async () => {
            if (currentProjectId !== meta.id) {
                await loadProject(meta.id);
            }
        };

        button.oncontextmenu = e => {
            e.preventDefault();

            showInlineInput({
                initialValue: meta.name || '',
                placeholder: 'Enter project name...',
                onSave: async (newName) => {
                    if (meta.name === newName) return;

                    await updateProjectMetaOnly(meta.id, { name: newName });

                    if (currentProjectId === meta.id) {
                        updateProjectTitle();
                    }

                    await loadSavedCodes();
                }
            });
        };

        button.onmousedown = e => {
            if (e.button === 1) {
                e.preventDefault();

                (async () => {
                    await updateProjectMetaOnly(meta.id, { inTrash: true });

                    if (currentProjectId === meta.id) {
                        currentProjectId = null;
                        localStorage.removeItem('lastOpenedProjectId');
                        await loadFallbackProject();
                    } else {
                        await loadSavedCodes();
                    }
                })();
            }
        };

        if (meta.id === currentProjectId) {
            button.classList.add('selected');
        }

        versionList.appendChild(button);
    });
}

async function handleMainProjectDeletion(projectMeta) {
    const versions = getVersionProjectMetaList(projectMeta.id);

    if (versions.length > 0) {
        versions.sort((a, b) => compareVersions(a.version, b.version));

        const projectToPromote = versions[0];
        const newParentId = projectToPromote.id;

        await updateProjectMetaOnly(projectToPromote.id, { parentId: null });

        for (const sibling of versions.slice(1)) {
            await updateProjectMetaOnly(sibling.id, { parentId: newParentId });
        }
    }
}

async function loadSavedCodes() {
    if (!projectMetaHydrated && !metaHydrationPromise) {
        hydrateProjectMetadata(false)
            .then(() => {
                if (menu.style.display === 'flex') {
                    loadSavedCodes();
                }
            })
            .catch(console.error);
    }

    const allMetas = getAllProjectMeta();
    const versions = allMetas.filter(meta => meta.parentId);
    const mainProjects = sortProjectMetaList(allMetas.filter(meta => !meta.parentId && !meta.inTrash));
    const trashedProjects = allMetas.filter(meta => meta.inTrash);
    const currentMeta = getProjectMeta(currentProjectId);

    menu.innerHTML = `
        <div id="menu-controls">
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
        <div id="version-list-container" style="display: none;"></div>
    `;

    const projectList = menu.querySelector('#project-list');

    if (showExportArrows) {
        projectList.classList.add('show-export-arrows');
    }

    const basketView = menu.querySelector('#basket-view');

    mainProjects.forEach(meta => {
        const button = document.createElement('button');
        button.dataset.projectId = meta.id;

        if (currentSortMode === 'free') {
            button.draggable = true;
        }

        const textContainer = document.createElement('span');
        textContainer.className = 'project-info';

        const name = meta.name || `Project ${meta.id}`;
        const dateText = meta.known && meta.date ? formatDate(new Date(meta.date)) : '…';

        let detailsHtml = `<div class="project-details">`;
        detailsHtml += `<span class="project-time">${dateText}</span>`;

        if (meta.version) {
            detailsHtml += `<span class="project-version">${meta.version}</span>`;
        }

        detailsHtml += `</div>`;

        textContainer.innerHTML = `<span class="name">${name}</span>` + detailsHtml;

        const arrow = document.createElement('span');
        arrow.innerHTML = '↓';
        arrow.className = 'export-arrow';
        arrow.title = 'Export project as .zip';

        arrow.addEventListener('click', e => {
            e.stopPropagation();
            exportProjectAsZip(meta.id);
            e.currentTarget.classList.add('exported');
            setTimeout(() => e.currentTarget.classList.remove('exported'), 300000);
        });

        button.appendChild(textContainer);
        button.appendChild(arrow);

        let pressTimer;

        button.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                pressTimer = setTimeout(() => {
                    const added = addProjectToLauncher(meta.id);

                    if (added) {
                        showNotification(`Added "${name}" to Launcher`);
                    } else {
                        showNotification(`"${name}" is already in Launcher`);
                    }

                    pressTimer = null;
                }, 800);
            } else if (e.button === 1) {
                e.preventDefault();

                (async () => {
                    await handleMainProjectDeletion(meta);
                    await updateProjectMetaOnly(meta.id, { inTrash: true });

                    const currentMetaAfter = getProjectMeta(currentProjectId);

                    if (
                        currentProjectId === meta.id ||
                        (currentMetaAfter && currentMetaAfter.parentId === meta.id)
                    ) {
                        currentProjectId = null;
                        localStorage.removeItem('lastOpenedProjectId');
                        await loadFallbackProject();
                    } else {
                        await loadSavedCodes();
                    }
                })();
            }
        });

        button.addEventListener('mouseup', (e) => {
            if (e.button === 0 && pressTimer) {
                clearTimeout(pressTimer);

                (async () => {
                    if (currentProjectId !== meta.id) {
                        await loadProject(meta.id);
                    } else {
                        await renderVersionList(meta.id);
                    }
                })();
            }
        });

        button.addEventListener('mouseleave', () => {
            if (pressTimer) clearTimeout(pressTimer);
        });

        button.oncontextmenu = e => {
            e.preventDefault();

            showInlineInput({
                initialValue: meta.name || '',
                placeholder: 'Enter project name...',
                onSave: async (newName) => {
                    if (meta.name === newName) return;

                    const nameExists = getAllProjectMeta().some(m => {
                        return m.id !== meta.id &&
                               !m.inTrash &&
                               m.name &&
                               m.name.toLowerCase() === newName.toLowerCase();
                    });

                    if (nameExists) {
                        showNotification('A project with that name already exists.');
                        return;
                    }

                    await updateProjectMetaOnly(meta.id, { name: newName });

                    if (currentProjectId === meta.id) {
                        updateProjectTitle();
                    }

                    await loadSavedCodes();
                }
            });
        };

        if (meta.id === currentProjectId || (currentMeta && currentMeta.parentId === meta.id)) {
            button.classList.add('selected');
        }

        projectList.appendChild(button);
    });

    if (currentMeta) {
        const parentIdToShow = currentMeta.parentId || currentMeta.id;
        const hasVersions = getVersionProjectMetaList(parentIdToShow).length > 0;
        const parentIsMainProject = mainProjects.some(p => p.id === parentIdToShow);

        if (hasVersions || (parentIsMainProject && currentMeta.version)) {
            renderVersionList(parentIdToShow);
        }
    }

    document.getElementById('saveBtn').onclick = () => saveCurrentCode(false);
    document.getElementById('newVerBtn').onclick = createNewVersion;

    document.getElementById('exportToggleBtn').onclick = () => {
        showExportArrows = !showExportArrows;
        projectList.classList.toggle('show-export-arrows', showExportArrows);
    };

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

    document.getElementById('colorThemeBtn').onclick = () => {
        colorPicker.style.display = (colorPicker.style.display === 'none' || colorPicker.style.display === '') ? 'flex' : 'none';
    };

    const basketBtn = document.getElementById('basketBtn');
    updateBasketButtonText();

    basketBtn.onclick = () => {
        const isBasketVisible = basketView.style.display !== 'none';

        if (isBasketVisible) {
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

            const trashed = getTrashedProjectMetaList();

            for (const meta of trashed) {
                if (!meta.parentId) {
                    await handleMainProjectDeletion(meta);
                }
            }

            await Promise.all(trashed.map(meta => deleteCode(meta.id)));
            await loadSavedCodes();
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

            for (let index = 0; index < projectButtons.length; index++) {
                const projectId = parseInt(projectButtons[index].dataset.projectId, 10);
                const meta = getProjectMeta(projectId);

                if (meta && (meta.order ?? -1) !== index) {
                    await updateProjectMetaOnly(projectId, { order: index });
                }
            }
        });
    }

    updateFileInfo();

    const savedScroll = localStorage.getItem('projectListScrollPosition');

    if (savedScroll) {
        setTimeout(() => {
            projectList.scrollTop = parseInt(savedScroll, 10);
        }, 0);
    }

    projectList.addEventListener('scroll', () => {
        localStorage.setItem('projectListScrollPosition', projectList.scrollTop);
    });
}