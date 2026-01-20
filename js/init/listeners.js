function setupEventListeners() {
    window.addEventListener('resize', checkOverflow);

    window.addEventListener('message', e => { 
        if (e.source === scene.contentWindow) { 
            logToConsole(e.data.type, e.data.content); 
        } 
    });
    
    window.addEventListener('paste', e => {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            uploadFiles(e.clipboardData.files, '');
        }
    });

    window.addEventListener('beforeunload', e => e.stopImmediatePropagation());

    projectTitle.addEventListener('click', toggleFilePanel);
    menuBtn.addEventListener('click', toggleMenu);
    
    const addFileBtn = document.getElementById('add-file-btn');
    addFileBtn.onclick = () => createNewItem(false, '');
    addFileBtn.addEventListener('contextmenu', e => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = e => {
            uploadFiles(e.target.files, '');
        };
        input.click();
    });

    filePanel.addEventListener('mousedown', e => {
        if (e.button !== 1) return;
        const target = e.target.closest('.file-entry');
        if (!target) return;
        e.preventDefault();
        const pathToDelete = target.dataset.path;
        const isFolder = target.classList.contains('folder');
        if (pathToDelete.toLowerCase() === 'index.html') {
            showNotification("Cannot delete index.html");
            return;
        }

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
    });

    filePanel.addEventListener('contextmenu', e => {
        e.preventDefault();
        const target = e.target.closest('.file-entry');
        const path = target ? target.dataset.path : '';
        const isFolder = target ? target.classList.contains('folder') : true;
        showContextMenu(e.clientX, e.clientY, path, isFolder);
    });

    document.addEventListener('click', () => contextMenu.style.display = 'none');
    
    for (const type in colorTypes) {
        document.getElementById(type).addEventListener('change', () => changeColor(type));
    }
    exportBtn.addEventListener('click', exportSettings);
    importBtn.addEventListener('click', importSettings);

    copyBtn.addEventListener('click', () => {
        if (activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
            files[activeFilePath].code = editor.getValue();
        }
        const output = [];
        const fileKeys = Object.keys(files).sort();
        const indexHtmlPath = fileKeys.find(key => key.toLowerCase() === 'index.html');
        if (indexHtmlPath) {
            const index = fileKeys.indexOf(indexHtmlPath);
            if (index > -1) {
                fileKeys.splice(index, 1);
                fileKeys.unshift(indexHtmlPath);
            }
        }
        for (const path of fileKeys) {
            if (path.split('/').pop() === '.p') continue;
            if (files[path] && !files[path].isBinary) {
                output.push(`${path}\n\`\`\`\n${files[path].code}\n\`\`\``);
            }
        }
        const textToCopy = output.join('\n\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            showNotification('Code for all files copied');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showNotification('Error: Could not copy code');
        });
    });

    if (pasteProjectBtn) {
        pasteProjectBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) {
                    showNotification('Clipboard is empty');
                    return;
                }
                const newFileSet = {};
                const regex = /^(.+?)\s*\r?\n\`\`\`(?:.*)\r?\n([\s\S]+?)\r?\n\`\`\`/gm;
                let match;
                let foundFiles = false;
                while ((match = regex.exec(text)) !== null) {
                    foundFiles = true;
                    const filename = match[1].trim();
                    const code = match[2];
                    if (filename) {
                        newFileSet[filename] = { code: code, isBinary: false };
                    }
                }
                if (!foundFiles) {
                    showNotification('Could not parse files from clipboard. Use format:\nfilename\n```\ncode\n```\n...for each file');
                    return;
                }
                currentProjectId = null;
                const newOpenTabs = Object.keys(newFileSet);
                const indexHtmlPath = newOpenTabs.find(key => key.toLowerCase() === 'index.html');
                if (indexHtmlPath) {
                    const index = newOpenTabs.indexOf(indexHtmlPath);
                    if (index > -1) {
                        newOpenTabs.splice(index, 1);
                        newOpenTabs.unshift(indexHtmlPath);
                    }
                }
                initializeEditorWithFiles(newFileSet, newOpenTabs, null);
                updateProjectTitle();
                showNotification('Project loaded');
            } catch (err) {
                console.error('Failed to read clipboard or parse project:', err);
                if (err.name === 'NotAllowedError') {
                   showNotification('Clipboard access denied by browser');
                } else {
                   showNotification('Error: Could not load from clipboard');
                }
            }
        });
    }
    
    runBtn.addEventListener('click', async () => {
        await saveCurrentCode(true);
        window.open(`${location.origin}${location.pathname}#t`, '_blank');
    });
}