function setupDragDrop() {
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

    let dragOverItem = null;

    filePanel.addEventListener('dragstart', e => {
        const target = e.target.closest('.file-entry');
        if (target) {
            e.dataTransfer.setData('text/path', target.dataset.path);
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => target.classList.add('dragging'), 0);
        } else {
            e.preventDefault();
        }
    });

    const cleanupDragStyles = () => {
        const draggingElement = filePanel.querySelector('.dragging');
        if (draggingElement) draggingElement.classList.remove('dragging');
        if (dragOverItem) {
            dragOverItem.classList.remove('drag-over');
            dragOverItem = null;
        }
    };

    filePanel.addEventListener('dragend', cleanupDragStyles);

    filePanel.addEventListener('dragover', e => {
        e.preventDefault();
        const target = e.target.closest('.file-entry');
        if (target !== dragOverItem) {
            if (dragOverItem) dragOverItem.classList.remove('drag-over');
            if (target) target.classList.add('drag-over');
            dragOverItem = target;
        }
    });

    filePanel.addEventListener('dragleave', e => {
        if (dragOverItem && !filePanel.contains(e.relatedTarget)) {
            dragOverItem.classList.remove('drag-over');
            dragOverItem = null;
        }
    });

    const handleFileDrop = (e, destinationElement) => {
        e.preventDefault();
        cleanupDragStyles();

        const sourcePath = e.dataTransfer.getData('text/path');
        if (!sourcePath) return;

        let destinationFolderPath = '';
        if (destinationElement) {
            const targetPath = destinationElement.dataset.path;
            const isFolder = destinationElement.classList.contains('folder');
            destinationFolderPath = isFolder ? targetPath : targetPath.substring(0, targetPath.lastIndexOf('/'));
        }
        moveItem(sourcePath, destinationFolderPath);
    };

    filePanel.addEventListener('drop', e => {
        handleFileDrop(e, e.target.closest('.file-entry'));
    });
    
    projectTitle.addEventListener('dragover', e => e.preventDefault());
    projectTitle.addEventListener('drop', e => handleFileDrop(e, null));

    const editorWrapper = editor.getWrapperElement();
    const fileTabs = document.getElementById('file-tabs');

    editorWrapper.addEventListener('dragstart', (e) => {
        if (editor.somethingSelected()) {
            e.dataTransfer.setData('text/plain', editor.getSelection());
            e.dataTransfer.setData('application/codemirror-selection', 'true');
        }
    });

    fileTabs.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('application/codemirror-selection')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            fileTabs.classList.add('text-drag-over');
        }
    });

    fileTabs.addEventListener('dragleave', (e) => {
        if (!fileTabs.contains(e.relatedTarget)) {
            fileTabs.classList.remove('text-drag-over');
        }
    });
    
    fileTabs.addEventListener('drop', (e) => {
        fileTabs.classList.remove('text-drag-over');
        if (e.dataTransfer.types.includes('application/codemirror-selection')) {
            e.preventDefault();
            const draggedText = editor.getSelection();
            if (!draggedText) return;

            // Common file creation logic
            let i = 1;
            let newFilename;
            do {
                newFilename = `code${i}.js`;
                i++;
            } while (files[newFilename]);

            files[newFilename] = {
                code: draggedText,
                doc: CodeMirror.Doc(draggedText, getModeForFilename(newFilename)),
                isBinary: false
            };

            // Determine which zone was dropped on
            const tabsRect = fileTabs.getBoundingClientRect();
            const dropX = e.clientX - tabsRect.left;
            const zoneWidth = tabsRect.width / 3;
            
            let dropAction = '';
            if (dropX < zoneWidth) {
                dropAction = 'tag';
            } else if (dropX < zoneWidth * 2) {
                dropAction = 'nothing';
            } else {
                dropAction = 'inject';
            }
            
            // Perform action based on zone
            switch(dropAction) {
                case 'tag':
                    editor.replaceSelection(`<script src="${newFilename}"></script>`);
                    break;
                case 'nothing':
                    editor.replaceSelection('');
                    break;
                case 'inject':
                    editor.replaceSelection(`//<<"${newFilename}"`);
                    break;
            }

            openFile(newFilename);
            showNotification(`Created and linked ${newFilename}`);
        }
    });

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
        
        const TEXT_EXTENSIONS = new Set(['txt', 'js', 'json', 'html', 'htm', 'css', 'xml', 'svg', 'md', 'csv', 'log', 'ini', 'yaml', 'yml', 'toml', 'sh', 'bash', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'ts', 'tsx', 'jsx']);

        for (const { file, path: basePath } of droppedFiles) {
            let originalName = file.name;
            let finalName = originalName;
            let finalPath = (basePath ? `${basePath}/${finalName}` : finalName).replace(/^\//, '');

            if (files[finalPath]) {
                let counter = 1;
                const nameParts = originalName.split('.');
                const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
                const baseName = nameParts.join('.');
                
                do {
                    finalName = `${baseName}(${counter})${extension}`;
                    finalPath = (basePath ? `${basePath}/${finalName}` : finalName).replace(/^\//, '');
                    counter++;
                } while (files[finalPath]);
            }

            const reader = new FileReader();
            const extension = finalName.split('.').pop().toLowerCase();
            const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));

            reader.onload = e => {
                if (isText) {
                    const code = e.target.result;
                    files[finalPath] = {
                        code: code,
                        doc: CodeMirror.Doc(code, getModeForFilename(finalPath)),
                        isBinary: false,
                    };
                    openFile(finalPath);
                } else {
                    const arrayBuffer = e.target.result;
                    const compressed = pako.gzip(new Uint8Array(arrayBuffer));
                    files[finalPath] = {
                        isBinary: true,
                        mimeType: file.type || 'application/octet-stream',
                        content: compressed
                    };
                }
                remaining--;
                if (remaining === 0) onDone();
            };
            reader.onerror = e => {
                showNotification(`Error reading ${originalName}`);
                console.error(e);
                remaining--;
                if (remaining === 0) onDone();
            };
            
            if (isText) {
                reader.readAsText(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        }
    }
    
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', async e => {
        e.preventDefault();
        if (e.target.closest('#menu') || e.target.closest('#file-panel') || e.target.closest('#project-title') || e.target.closest('#file-tabs')) return;
        
        if (!e.dataTransfer || !e.dataTransfer.items) return;

        const droppedFiles = [];
        const entries = Array.from(e.dataTransfer.items).map(item => item.webkitGetAsEntry());
        
        await collectFilesFromEntries(entries, '', droppedFiles);

        if (droppedFiles.length > 0) {
            addDroppedFilesToProject(droppedFiles);
        }
    });
}