function showContextMenu(x, y, path, isFolder) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';

    let menuItems = `<div id="ctx-new-file">New File</div><div id="ctx-new-folder">New Folder</div><div id="ctx-upload-file">Upload File</div>`;
    if (path && path.toLowerCase() !== 'index.html') {
        menuItems += `<div id="ctx-rename">Rename</div><div id="ctx-delete">Delete</div>`;
    }
    if (path && !isFolder && files[path] && files[path].isBinary) {
        menuItems += `<div id="ctx-open-as-text">Open as text</div>`;
    }
    contextMenu.innerHTML = menuItems;

    document.getElementById('ctx-new-file').onclick = () => createNewItem(false, isFolder ? path : path.substring(0, path.lastIndexOf('/')));
    document.getElementById('ctx-new-folder').onclick = () => createNewItem(true, isFolder ? path : path.substring(0, path.lastIndexOf('/')));
    document.getElementById('ctx-upload-file').onclick = () => {
        const uploadPath = isFolder ? path : path.substring(0, path.lastIndexOf('/'));
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = e => {
            uploadFiles(e.target.files, uploadPath);
        };
        input.click();
    };
    if (path && path.toLowerCase() !== 'index.html') {
        document.getElementById('ctx-rename').onclick = () => renameItem(path, isFolder);
        document.getElementById('ctx-delete').onclick = () => deleteItem(path, isFolder);
    }
    const openAsTextBtn = document.getElementById('ctx-open-as-text');
    if (openAsTextBtn) {
        openAsTextBtn.onclick = () => {
            forceOpenAsText.add(path);
            openFile(path);
        };
    }
}

function createNewItem(isFolder, basePath) {
    const type = isFolder ? 'folder' : 'file';
    showInlineInput({
        placeholder: `Enter new ${type} name...`,
        onSave: (name) => {
            const newPath = basePath ? `${basePath}/${name}`.replace(/^\//, '') : name;

            if (isFolder) {
                const placeholderPath = `${newPath}/.p`;
                if (files[placeholderPath]) {
                    showNotification('Folder already exists.');
                    return;
                }
                files[placeholderPath] = { code: '', doc: CodeMirror.Doc('', 'text/plain'), isBinary: false };
            } else {
                if (files[newPath]) {
                    showNotification('File already exists.');
                    return;
                }
                files[newPath] = { code: '', doc: CodeMirror.Doc('', getModeForFilename(newPath)), isBinary: false };
                openFile(newPath);
            }
            renderAll();
        }
    });
}

function renameItem(oldPath, isFolder) {
    const oldName = oldPath.split('/').pop();
    
    showInlineInput({
        initialValue: oldName,
        onSave: (newName) => {
            if (!newName || newName === oldName) return;

            const basePath = oldPath.substring(0, oldPath.lastIndexOf('/'));
            const newPath = basePath ? `${basePath}/${newName}` : newName;

            if (isFolder) {
                if (Object.keys(files).some(p => p.startsWith(newPath + '/'))) {
                    showNotification('A folder with that name already exists.');
                    return;
                }
                Object.keys(files).forEach(path => {
                    if (path.startsWith(oldPath + '/')) {
                        const updatedPath = path.replace(oldPath, newPath);
                        files[updatedPath] = files[path];
                        delete files[path];
                        const openTabIndex = openTabs.indexOf(path);
                        if (openTabIndex > -1) openTabs[openTabIndex] = updatedPath;
                    }
                });
                if (activeFilePath && activeFilePath.startsWith(oldPath + '/')) {
                    activeFilePath = activeFilePath.replace(oldPath, newPath);
                }
            } else {
                if (files[newPath]) {
                    showNotification('A file with that name already exists.');
                    return;
                }
                files[newPath] = files[oldPath];
                delete files[oldPath];
                const openTabIndex = openTabs.indexOf(oldPath);
                if (openTabIndex > -1) openTabs[openTabIndex] = newPath;
                if (activeFilePath === oldPath) activeFilePath = newPath;
            }
            renderAll();
        }
    });
}

function deleteItem(pathToDelete, isFolder) {
    if (isFolder) {
        const folderContents = {};
        const keysToDelete = Object.keys(files).filter(path => path.startsWith(pathToDelete + '/'));
        
        keysToDelete.forEach(path => {
            const { doc, ...rest } = files[path];
            folderContents[path] = rest;
        });
        basket.push({ type: 'folder', path: pathToDelete, files: folderContents });
        
        keysToDelete.forEach(path => {
            closeTab(path);
            delete files[path];
        });
    } else {
        const { doc, ...rest } = files[pathToDelete];
        basket.push({ type: 'file', path: pathToDelete, data: rest });

        closeTab(pathToDelete);
        delete files[pathToDelete];
    }
    
    saveBasket();
    renderAll();
}