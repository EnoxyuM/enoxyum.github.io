let updateReportTimer = null;

function normalizeClipboardFilePath(raw) {
    let p = String(raw || '').trim();
    p = p.replace(/\\/g, '/');
    p = p.replace(/^\.\//, '');
    p = p.replace(/^\/+/, '');
    return p;
}

function isValidClipboardFilePath(p) {
    if (!p || p.length > 260) return false;
    if (/[\r\n\0<>|"?*]/.test(p)) return false;
    if (/^[a-zA-Z]+:\/\//.test(p)) return false;

    const parts = p.split('/');
    if (parts.some(seg => !seg || seg === '.' || seg === '..')) return false;

    const filename = parts[parts.length - 1];
    if (filename === '.p') return false;
    if (/[,;!()[\]{}]/.test(filename)) return false;

    const hasExt = /^(?:\.?[^./]+(?:\.[^./]+)+|\.[a-zA-Z0-9_-]+)$/.test(filename);
    const isKnownSpecial = /^(?:Makefile|Dockerfile|README|LICENSE|CHANGELOG|Procfile)$/i.test(filename);
    if (!hasExt && !isKnownSpecial) return false;

    if (filename.includes('.') && !filename.startsWith('.')) {
        const ext = filename.split('.').pop();
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,11}$/.test(ext) && !/^(?:7z|mp3|mp4|h264|woff2|ttf|otf|sqlite3|m4a|m4v)$/i.test(ext)) {
            return false;
        }
    }

    return true;
}

function extractCandidatePath(text, allowSpaces = false) {
    let s = String(text || '').trim();
    if (!s) return null;

    const unwrapBold = (str) => {
        let cur = str.trim();
        let changed = true;
        while (changed) {
            changed = false;
            if (cur.startsWith('**') && cur.endsWith('**') && cur.length > 4) {
                cur = cur.slice(2, -2).trim();
                changed = true;
            } else if (cur.startsWith('__') && cur.endsWith('__') && cur.length > 4) {
                cur = cur.slice(2, -2).trim();
                changed = true;
            }
        }
        return cur;
    };

    s = unwrapBold(s);
    s = s.replace(/^(?:(?:file|файл)\s*\d*\s*[:.-]?\s*|\d+[.)]\s+)/i, '').trim();
    s = unwrapBold(s);
    s = s.replace(/\s*:\s*$/, '').trim();

    const btMatch = s.match(/^`([^`]+)`(?:\s*(?:[-–—:(].*)?)?$/);
    if (btMatch) {
        const cand = normalizeClipboardFilePath(btMatch[1]);
        return isValidClipboardFilePath(cand) ? cand : null;
    }

    const cand = normalizeClipboardFilePath(s);
    if (!isValidClipboardFilePath(cand)) return null;
    if (cand.includes(' ') && !allowSpaces && !files[cand]) return null;
    return cand;
}

function parseFileHeaderLine(rawLine, nextNonEmptyLineIsFence) {
    const line = rawLine.trim();
    if (!line) return { type: 'empty' };

    if (/^([-*_])\s*(\1\s*){2,}$/.test(line)) {
        return { type: 'hr' };
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
        const headingBody = headingMatch[1].replace(/\s+#+\s*$/, '').trim();
        const cand = extractCandidatePath(headingBody, false);
        if (cand) return { type: 'file', path: cand };
        return { type: 'heading' };
    }

    const boldMatch = line.match(/^\*\*(.+?)\*\*\s*:?\s*$/);
    if (boldMatch) {
        const cand = extractCandidatePath(boldMatch[1], false);
        if (cand) return { type: 'file', path: cand };
    }

    const backtickOnlyMatch = line.match(/^`([^`]+)`\s*:?\s*$/);
    if (backtickOnlyMatch) {
        const cand = normalizeClipboardFilePath(backtickOnlyMatch[1]);
        if (isValidClipboardFilePath(cand)) return { type: 'file', path: cand };
    }

    const labeledMatch = line.match(/^(?:[-*+]|\d+[.)])?\s*(?:file|файл)\s*(?::|\s)\s*(.+)$/i);
    if (labeledMatch) {
        const cand = extractCandidatePath(labeledMatch[1], false);
        if (cand) return { type: 'file', path: cand };
    }

    const listMatch = line.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
        const itemText = listMatch[1].trim();
        const hasExplicitMarkup = /^(`[^`]+`|\*\*.*\*\*)/.test(itemText);
        const cand = extractCandidatePath(itemText, false);
        if (cand && (hasExplicitMarkup || nextNonEmptyLineIsFence)) {
            return { type: 'file', path: cand };
        }
    }

    if (nextNonEmptyLineIsFence) {
        const cand = extractCandidatePath(line, false);
        if (cand) return { type: 'file', path: cand };
    }

    return { type: 'text' };
}

function parseFilesFromClipboardText(rawText) {
    const text = String(rawText || '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const parsedFiles = new Map();

    const isFenceOpeningLine = (line) => {
        const m = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
        if (!m) return null;
        const char = m[1][0];
        if (char === '`' && m[2].includes('`')) return null;
        return { char, len: m[1].length };
    };

    const isFenceClosingLine = (line, char, minLen) => {
        const re = char === '`'
            ? new RegExp(`^\\s{0,3}\`{${minLen},}\\s*$`)
            : new RegExp(`^\\s{0,3}~{${minLen},}\\s*$`);
        return re.test(line);
    };

    const getNextNonEmptyLine = (startIndex) => {
        for (let j = startIndex; j < lines.length; j++) {
            const trimmed = lines[j].trim();
            if (trimmed !== '') return trimmed;
        }
        return '';
    };

    let inFence = false;
    let fenceChar = '';
    let fenceLen = 0;
    let fenceLines = [];
    let activeBlockFile = null;
    let currentSectionFile = null;
    let currentSectionBlockCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (inFence) {
            if (isFenceClosingLine(line, fenceChar, fenceLen)) {
                if (activeBlockFile) {
                    const code = fenceLines.join('\n');
                    if (currentSectionBlockCount === 0 || !parsedFiles.has(activeBlockFile)) {
                        parsedFiles.set(activeBlockFile, code);
                    } else {
                        const existingCode = parsedFiles.get(activeBlockFile);
                        if (code.length >= existingCode.length) {
                            parsedFiles.set(activeBlockFile, code);
                        }
                    }
                    currentSectionBlockCount++;
                }
                inFence = false;
                fenceChar = '';
                fenceLen = 0;
                fenceLines = [];
                activeBlockFile = null;
            } else {
                fenceLines.push(line);
            }
            continue;
        }

        const opening = isFenceOpeningLine(line);
        if (opening) {
            inFence = true;
            fenceChar = opening.char;
            fenceLen = opening.len;
            fenceLines = [];
            activeBlockFile = currentSectionFile;
            continue;
        }

        const nextNonEmpty = getNextNonEmptyLine(i + 1);
        const nextIsFence = Boolean(nextNonEmpty && isFenceOpeningLine(nextNonEmpty));
        const parsedLine = parseFileHeaderLine(line, nextIsFence);

        if (parsedLine.type === 'file') {
            currentSectionFile = parsedLine.path;
            currentSectionBlockCount = 0;
        } else if (parsedLine.type === 'heading' || parsedLine.type === 'hr') {
            currentSectionFile = null;
            currentSectionBlockCount = 0;
        }
    }

    return parsedFiles;
}

function showUpdateReport(updatedFiles, createdFiles) {
    const reportEl = document.getElementById('update-report');
    if (!reportEl) return;

    if (!reportEl.dataset.listenersAttached) {
        reportEl.dataset.listenersAttached = 'true';
        reportEl.addEventListener('click', () => {
            if (window.getSelection && window.getSelection().toString()) return;
            if (updateReportTimer) {
                clearTimeout(updateReportTimer);
                updateReportTimer = null;
            }
            reportEl.classList.remove('visible');
        });
        reportEl.addEventListener('mouseenter', () => {
            if (updateReportTimer) {
                clearTimeout(updateReportTimer);
                updateReportTimer = null;
            }
        });
        reportEl.addEventListener('mouseleave', () => {
            if (!reportEl.classList.contains('visible')) return;
            if (updateReportTimer) clearTimeout(updateReportTimer);
            updateReportTimer = setTimeout(() => {
                reportEl.classList.remove('visible');
            }, 6000);
        });
    }

    const reportLines = [];
    reportLines.push(`updated ${updatedFiles.length} files:`);
    for (const filePath of updatedFiles) {
        reportLines.push(filePath);
    }
    reportLines.push(`created ${createdFiles.length} files:`);
    for (const filePath of createdFiles) {
        reportLines.push(filePath);
    }

    reportEl.textContent = reportLines.join('\n');
    reportEl.scrollTop = 0;
    reportEl.classList.add('visible');

    if (updateReportTimer) clearTimeout(updateReportTimer);
    updateReportTimer = setTimeout(() => {
        reportEl.classList.remove('visible');
    }, 10000);
}

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

    if (updateFilesBtn) {
        updateFilesBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) {
                    showNotification('Clipboard is empty');
                    return;
                }

                const parsedFiles = parseFilesFromClipboardText(text);
                if (parsedFiles.size === 0) {
                    showNotification('Could not parse any files from clipboard');
                    return;
                }

                const updatedFiles = [];
                const createdFiles = [];
                let activeViewNeedsRefresh = false;

                editor.off("change", updateScene);

                try {
                    const existingKeys = Object.keys(files);
                    const existingIndexHtml = existingKeys.find(key => key.toLowerCase() === 'index.html');

                    for (const [rawPath, code] of parsedFiles.entries()) {
                        let targetPath = rawPath;
                        if (!files[targetPath] && rawPath.toLowerCase() === 'index.html' && existingIndexHtml) {
                            targetPath = existingIndexHtml;
                        }

                        if (files[targetPath]) {
                            updatedFiles.push(targetPath);
                            if (files[targetPath].isBinary || !files[targetPath].doc) {
                                forceOpenAsText.delete(targetPath);
                                files[targetPath] = {
                                    code: code,
                                    doc: CodeMirror.Doc(code, getModeForFilename(targetPath)),
                                    isBinary: false
                                };
                                if (activeFilePath === targetPath) {
                                    activeViewNeedsRefresh = true;
                                }
                            } else {
                                files[targetPath].code = code;
                                files[targetPath].doc.setValue(code);
                            }
                        } else {
                            createdFiles.push(targetPath);
                            files[targetPath] = {
                                code: code,
                                doc: CodeMirror.Doc(code, getModeForFilename(targetPath)),
                                isBinary: false
                            };
                        }
                    }

                    if (activeViewNeedsRefresh && activeFilePath && files[activeFilePath]) {
                        updateEditorView(activeFilePath);
                    }
                } finally {
                    if (liveUpdateToggle.checked) {
                        editor.on("change", updateScene);
                    }
                }

                renderAll();
                if (liveUpdateToggle.checked) {
                    updateScene();
                }

                showUpdateReport(updatedFiles, createdFiles);
            } catch (err) {
                console.error('Failed to read clipboard or update files:', err);
                if (err.name === 'NotAllowedError') {
                    showNotification('Clipboard access denied by browser');
                } else {
                    showNotification('Error: Could not update files from clipboard');
                }
            }
        });
    }

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

    if (launcherBtn) {
        launcherBtn.addEventListener('click', () => {
            toggleLauncher();
        });
    }
}