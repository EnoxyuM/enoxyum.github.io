function toggleFilePanel() {
    filePanel.classList.toggle('open');
    editorElement.classList.toggle('file-panel-open');
    document.getElementById('file-tabs').classList.toggle('file-panel-open');
    setTimeout(() => { editor.refresh(); checkOverflow(); }, 300);
}

function moveItem(sourcePath, targetFolderPath) {
    const sourceName = sourcePath.split('/').pop();
    const newPath = targetFolderPath ? `${targetFolderPath}/${sourceName}` : sourceName;

    if (sourcePath === newPath || (targetFolderPath && targetFolderPath.startsWith(sourcePath + '/'))) {
        return;
    }

    const isFolder = !files[sourcePath] && Object.keys(files).some(p => p.startsWith(sourcePath + '/'));

    const collisionExists = Object.keys(files).some(p => {
        if (isFolder) {
            return p.startsWith(newPath + '/') || p === newPath;
        } else {
            return p === newPath;
        }
    });

    if (collisionExists) {
        showNotification(`An item named "${sourceName}" already exists.`);
        return;
    }

    if (isFolder) {
        const pathsToMove = Object.keys(files).filter(p => p.startsWith(sourcePath + '/'));
        pathsToMove.forEach(oldItemPath => {
            const relativePath = oldItemPath.substring(sourcePath.length);
            const newItemPath = newPath + relativePath;
            files[newItemPath] = files[oldItemPath];
            delete files[oldItemPath];
            const tabIndex = openTabs.indexOf(oldItemPath);
            if (tabIndex > -1) openTabs[tabIndex] = newItemPath;
        });

        if (activeFilePath && activeFilePath.startsWith(sourcePath + '/')) {
            activeFilePath = newPath + activeFilePath.substring(sourcePath.length);
        }

        const updatedOpenFolders = new Set();
        openFolders.forEach(folderPath => {
            if (folderPath.startsWith(sourcePath)) {
                updatedOpenFolders.add(newPath + folderPath.substring(sourcePath.length));
            } else {
                updatedOpenFolders.add(folderPath);
            }
        });
        if (openFolders.has(sourcePath)) {
            updatedOpenFolders.delete(sourcePath);
            updatedOpenFolders.add(newPath);
        }
        openFolders = updatedOpenFolders;
    } else {
        if (!files[sourcePath]) return;
        files[newPath] = files[sourcePath];
        delete files[sourcePath];
        const tabIndex = openTabs.indexOf(sourcePath);
        if (tabIndex > -1) openTabs[tabIndex] = newPath;
        if (activeFilePath === sourcePath) activeFilePath = newPath;
    }
    
    if (targetFolderPath) {
        openFolders.add(targetFolderPath);
    }

    renderAll();
}


function renderFilePanel() {
    if (isPreviewMode) return;
    filePanel.innerHTML = '';
    const paths = Object.keys(files);
    const tree = {};

    paths.forEach(path => {
        let currentLevel = tree;
        const parts = path.split('/');
        parts.forEach((part, index) => {
            if (part === '') return;
            if (index === parts.length - 1) {
                if (part === '.p') return;
                if (!currentLevel._files) currentLevel._files = {};
                currentLevel._files[part] = { path: path };
            } else {
                if (!currentLevel[part]) currentLevel[part] = {};
                currentLevel = currentLevel[part];
            }
        });
    });

    function renderTree(node, container, depth, parentPath = '') {
        const folders = Object.keys(node).filter(key => key !== '_files').sort();
        const filesList = node._files ? Object.keys(node._files).sort() : [];

        folders.forEach(key => {
            const currentPath = parentPath ? `${parentPath}/${key}` : key;
            const item = node[key];
            const folderDiv = document.createElement('div');
            const isOpen = openFolders.has(currentPath);

            folderDiv.className = 'file-entry folder';
            folderDiv.draggable = true;
            if (isOpen) {
                folderDiv.classList.add('open');
            }
            folderDiv.dataset.path = currentPath;
            folderDiv.style.paddingLeft = `${10 + depth * 15}px`;

            const icon = document.createElement('span');
            icon.className = 'folder-toggle-icon';
            icon.textContent = isOpen ? '▼ ' : '▶ ';
            folderDiv.appendChild(icon);

            const name = document.createElement('span');
            name.textContent = key;
            folderDiv.appendChild(name);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'folder-content';
            if (isOpen) {
                contentDiv.style.display = 'block';
            }

            folderDiv.addEventListener('click', (e) => {
                if (e.target.closest('.file-entry') !== folderDiv) return;
                
                const nowOpen = !openFolders.has(currentPath);
                if (nowOpen) {
                    openFolders.add(currentPath);
                } else {
                    openFolders.delete(currentPath);
                }

                folderDiv.classList.toggle('open', nowOpen);
                contentDiv.style.display = nowOpen ? 'block' : 'none';
                icon.textContent = nowOpen ? '▼ ' : '▶ ';
            });

            container.appendChild(folderDiv);
            container.appendChild(contentDiv);

            renderTree(item, contentDiv, depth + 1, currentPath);
        });

        filesList.forEach(key => {
            const item = node._files[key];
            const fileDiv = document.createElement('div');
            fileDiv.className = 'file-entry file';
            fileDiv.dataset.path = item.path;
            fileDiv.draggable = true;
            fileDiv.style.paddingLeft = `${10 + (depth * 15) + 10}px`;

            if (files[item.path] && files[item.path].isBinary) {
                fileDiv.textContent = '📦 ' + key;
            } else {
                fileDiv.textContent = '📄 ' + key;
            }

            if (openTabs.includes(item.path)) {
                fileDiv.classList.add('is-open');
            }

            if (item.path === activeFilePath) fileDiv.classList.add('active');
            fileDiv.onclick = () => openFile(item.path);
            container.appendChild(fileDiv);
        });
    }

    renderTree(tree, filePanel, 0);
}