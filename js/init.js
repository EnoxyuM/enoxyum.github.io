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
    document.getElementById('add-file-btn').onclick = () => createNewItem(false, '');

    filePanel.addEventListener('mousedown', e => {
        if (e.button !== 1) return;
        const target = e.target.closest('.file-entry');
        if (!target) return;
        e.preventDefault();
        const pathToDelete = target.dataset.path;
        const isFolder = target.classList.contains('folder');
        if (pathToDelete.toLowerCase() === 'index.html') {
            showNotification("Cannot delete index.html.");
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
        if (activeFilePath && files[activeFilePath]) {
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
            if (files[path]) {
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
                    showNotification('Clipboard is empty.');
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
                        newFileSet[filename] = code;
                    }
                }
                if (!foundFiles) {
                    showNotification('Could not parse files from clipboard. Use format:\nfilename\n```\ncode\n```\n...for each file.');
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
                showNotification('Project loaded from clipboard.');
            } catch (err) {
                console.error('Failed to read clipboard or parse project:', err);
                if (err.name === 'NotAllowedError') {
                   showNotification('Clipboard access denied by browser.');
                } else {
                   showNotification('Error: Could not load from clipboard.');
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
                for (const filepath in filesToLoad) {
                   files[filepath] = { code: filesToLoad[filepath] };
                }
                updateScene();
            } else {
                 scene.srcdoc = `<h1>Error</h1><p>Could not load project from URL.</p>`;
            }
        } catch(e) {
            console.error("URL preview load error:", e);
            scene.srcdoc = `<h1>Error</h1><p>Invalid or corrupted preview link.</p>`;
        }
    } else {
        openDB().then(() => {
            const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');
            if (!lastOpenedIdStr) {
                scene.srcdoc = "<h1>Error</h1><p>No project ID found in local storage. Please run a project from the editor first.</p>";
                return;
            }
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(lastOpenedId);
            request.onsuccess = e => {
                const project = e.target.result;
                if (project && project.files) {
                    for (const filepath in project.files) {
                       files[filepath] = { code: project.files[filepath] };
                    }
                    updateScene();
                } else {
                    scene.srcdoc = `<h1>Error</h1><p>Project with ID ${lastOpenedId} not found.</p>`;
                }
            };
            request.onerror = e => {
                scene.srcdoc = `<h1>Error</h1><p>Could not access the project database.</p>`;
            }
        });
    }
}