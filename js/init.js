if (!isPreviewMode) {
    editor = CodeMirror(editorElement, {
        lineNumbers: true,
        mode: "htmlmixed",
        theme: "monokai",
        lineWrapping: true,
        viewportMargin: Infinity,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-S": function(cm) {
                saveCurrentCode(true);
                return false;
            }
        },
        highlightSelectionMatches: {showToken: /\w/, annotateScrollbar: true}
    });

    window.addEventListener('resize', checkOverflow);

    tabsWrapper.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(tabsWrapper, e.clientX);
        const dragging = document.querySelector('.dragging');
        if (dragging) {
            if (afterElement == null) {
                tabsWrapper.appendChild(dragging);
            } else {
                tabsWrapper.insertBefore(dragging, afterElement);
            }
        }
    });

    tabsWrapper.addEventListener('drop', e => {
        e.preventDefault();
        openTabs = Array.from(tabsWrapper.querySelectorAll('.tab')).map(tab => tab.dataset.filepath);
    });
    
    if (localStorage.getItem('liveUpdateEnabled') === 'false') {
        liveUpdateToggle.checked = false;
    }

    const configureLiveUpdate = () => {
        editor.off("change", updateScene);
        if (liveUpdateToggle.checked) {
            editor.on("change", updateScene);
        }
    };

    configureLiveUpdate();

    liveUpdateToggle.addEventListener('change', function() {
        localStorage.setItem('liveUpdateEnabled', this.checked);
        configureLiveUpdate();
        if (this.checked) {
            updateScene();
        }
    });
    
    let altPressed = false, shiftAltPressed = false;
    document.addEventListener('keydown', e => { 
        if (e.key === 'Escape') { toggleMenu(); } 
        else if (e.altKey && !e.shiftKey && !altPressed) { e.preventDefault(); altPressed = true; toggleEditor(); } 
        else if (e.altKey && e.shiftKey && !shiftAltPressed) { e.preventDefault(); shiftAltPressed = true; toggleConsole(); } 
    });
    document.addEventListener('keyup', e => { 
        if (!e.altKey) { altPressed = false; shiftAltPressed = false; } 
    });
    
    scene.addEventListener('load', () => {
        if (scene.contentWindow) {
            scene.contentWindow.addEventListener('keydown', e => { 
                if (e.key === 'Escape') { e.preventDefault(); toggleMenu(); } 
                else if (e.altKey && !e.shiftKey) { e.preventDefault(); toggleEditor(); } 
                else if (e.altKey && e.shiftKey) { e.preventDefault(); toggleConsole(); } 
            });
        }
    });
    
    window.addEventListener('message', e => { if (e.source === scene.contentWindow) { logToConsole(e.data.type, e.data.content); } });
    
    editorElement.style.display = 'block'; consoleElem.style.display = 'none'; scene.style.zIndex = '0'; editor.focus(); editorElement.style.pointerEvents = 'auto'; scene.style.pointerEvents = 'none'; showingEditor = true;
    
    let fontSize = 14; editorElement.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); fontSize += e.deltaY > 0 ? -1 : 1; fontSize = Math.max(8, Math.min(24, fontSize)); editorElement.style.fontSize = fontSize + 'px'; editor.refresh(); } });
    let opacity = 0.5; editorElement.addEventListener('wheel', e => { if (e.shiftKey) { e.preventDefault(); opacity += e.deltaY > 0 ? -0.05 : 0.05; opacity = Math.max(0.1, Math.min(1, opacity)); editorElement.style.backgroundColor = `rgba(30, 30, 30, ${opacity})`; } });
    
    window.addEventListener('beforeunload', e => e.stopImmediatePropagation());

    projectTitle.addEventListener('click', toggleFilePanel);
    
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

    // --- Drag and Drop Logic ---
    async function collectFilesFromEntries(entries, path, fileList) {
        for (const entry of entries) {
            if (entry.isFile) {
                const file = await new Promise(resolve => entry.file(resolve));
                fileList.push({ file, path });
            } else if (entry.isDirectory) {
                const newPath = (path ? `${path}/${entry.name}` : entry.name).replace(/^\//, '');
                const dirReader = entry.createReader();
                const subEntries = await new Promise(resolve => dirReader.readEntries(resolve));
                await collectFilesFromEntries(subEntries, newPath, fileList);
            }
        }
    }

    function addDroppedFilesToProject(droppedFiles) {
        let remaining = droppedFiles.length;
        if (remaining === 0) return;

        const onDone = () => {
            renderAll();
            if (liveUpdateToggle.checked) {
                updateScene();
            }
            showNotification(`Uploaded ${droppedFiles.length} file(s) via drop.`);
        };

        for (const { file, path } of droppedFiles) {
            const newPath = (path ? `${path}/${file.name}` : file.name).replace(/^\//, '');

            if (files[newPath] && !confirm(`File "${newPath}" already exists. Overwrite?`)) {
                remaining--;
                if (remaining === 0) onDone();
                continue;
            }

            const reader = new FileReader();
            reader.onload = e => {
                const arrayBuffer = e.target.result;
                const compressed = pako.gzip(new Uint8Array(arrayBuffer));
                files[newPath] = {
                    isBinary: true,
                    mimeType: file.type || 'application/octet-stream',
                    content: compressed
                };
                remaining--;
                if (remaining === 0) onDone();
            };
            reader.onerror = e => {
                showNotification(`Error reading ${file.name}`);
                console.error(e);
                remaining--;
                if (remaining === 0) onDone();
            };
            reader.readAsArrayBuffer(file);
        }
    }
    
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', async e => {
        e.preventDefault();
        if (e.target.closest('#menu')) return; // Don't handle drops on the menu
        
        if (!e.dataTransfer || !e.dataTransfer.items) return;

        const droppedFiles = [];
        const entries = Array.from(e.dataTransfer.items).map(item => item.webkitGetAsEntry());
        
        await collectFilesFromEntries(entries, '', droppedFiles);

        if (droppedFiles.length > 0) {
            addDroppedFilesToProject(droppedFiles);
        }
    });
    // --- End Drag and Drop Logic ---

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
            const keysToDelete = Object.keys(files).filter(path => path.startsWith(pathToDelete + '/'));
            keysToDelete.forEach(path => {
                closeTab(path);
                delete files[path];
            });
        } else {
            closeTab(pathToDelete);
            delete files[pathToDelete];
        }
        renderAll();
    });

    document.addEventListener('click', () => contextMenu.style.display = 'none');
    
    for (const type in colorTypes) document.getElementById(type).addEventListener('change', () => changeColor(type));
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
                initializeEditorWithFiles(newFileSet, newOpenTabs);
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

    openDB().then(async () => {
        if (await loadFromUrlHash()) {
            loadColors();
            return;
        }
        const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');
        if (lastOpenedIdStr) {
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(lastOpenedId);
            request.onsuccess = e => {
                if (e.target.result) { loadProject(lastOpenedId); loadColors(); }
                else { localStorage.removeItem('lastOpenedProjectId'); loadFallbackProject(); }
            };
            request.onerror = e => { console.error("Error checking last project:", e); localStorage.removeItem('lastOpenedProjectId'); loadFallbackProject(); };
        } else {
            loadFallbackProject();
        }
    });

} else {
    editorElement.remove();
    if (location.hash.startsWith('#t=')) {
        try {
            const encodedData = location.hash.substring(3);
            const compressedBytes = decodeBaseCustom(encodedData);
            const decompressed = pako.ungzip(compressedBytes);
            const binaryData = new Uint8Array(decompressed);
            const { filesToLoad } = deserializeProjectOptimized(binaryData);

            if (Object.keys(filesToLoad).length > 0) {
                files = filesToLoad;
                updateScene();
            } else {
                 scene.srcdoc = `<h1>Error</h1><p>Error loading from URL</p>`;
            }
        } catch(e) {
            console.error("URL load error:", e);
            scene.srcdoc = `<h1>Error</h1><p>Invalid preview link</p>`;
        }
    } else {
        openDB().then(() => {
            const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');
            if (!lastOpenedIdStr) {
                scene.srcdoc = "<h1>Error</h1><p>No project ID found in local storage. Please run a project from the editor first</p>";
                return;
            }
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(lastOpenedId);
            request.onsuccess = e => {
                const project = e.target.result;
                if (project && project.files) {
                    files = project.files;
                    updateScene();
                } else {
                    scene.srcdoc = `<h1>Error</h1><p>Project with ID ${lastOpenedId} not found</p>`;
                }
            };
            request.onerror = e => {
                scene.srcdoc = `<h1>Error</h1><p>Could not access the project database</p>`;
            }
        });
    }
}