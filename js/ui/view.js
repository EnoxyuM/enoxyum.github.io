function renderAll() {
    if (isPreviewMode) return;
    renderTabs();
    renderFilePanel();
}

function showNotification(message) {
    let el = document.getElementById('notification');
    el.textContent = message;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

function updateEditorView(filepath) {
    if (currentMediaBlobUrl) {
        URL.revokeObjectURL(currentMediaBlobUrl);
        currentMediaBlobUrl = null;
    }

    const cmElement = editor.getWrapperElement();
    const mediaPreviewElement = document.getElementById('media-preview');
    const fileData = files[filepath];
    const openAsText = forceOpenAsText.has(filepath);

    if (fileData.isBinary && !openAsText) {
        const mime = fileData.mimeType.toLowerCase();
        if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) {
            cmElement.style.display = 'none';
            mediaPreviewElement.style.display = 'flex';
            mediaPreviewElement.innerHTML = '';
            try {
                const decompressed = pako.ungzip(fileData.content);
                const blob = new Blob([decompressed], { type: fileData.mimeType });
                currentMediaBlobUrl = URL.createObjectURL(blob);
                let mediaElement;
                if (mime.startsWith('image/')) {
                    mediaElement = document.createElement('img');
                } else if (mime.startsWith('video/')) {
                    mediaElement = document.createElement('video');
                    mediaElement.controls = true;
                } else {
                    mediaElement = document.createElement('audio');
                    mediaElement.controls = true;
                }
                mediaElement.src = currentMediaBlobUrl;
                mediaPreviewElement.appendChild(mediaElement);
            } catch (e) {
                console.error(`Error displaying media file ${filepath}:`, e);
                cmElement.style.display = 'block';
                mediaPreviewElement.style.display = 'none';
                editor.setOption("readOnly", true);
                editor.swapDoc(CodeMirror.Doc(`// Error displaying binary file: ${filepath}\n// ${e.message}`, 'text/plain'));
            }
        } else {
            cmElement.style.display = 'block';
            mediaPreviewElement.style.display = 'none';
            editor.setOption("readOnly", true);
            editor.swapDoc(CodeMirror.Doc(`// Binary file: ${filepath}\n// Cannot be edited.`, 'text/plain'));
        }
    } else {
        cmElement.style.display = 'block';
        mediaPreviewElement.style.display = 'none';
        if (openAsText) {
            let content;
            try {
                const decompressed = pako.ungzip(fileData.content);
                content = new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
            } catch (e) {
                content = `// Error reading binary file as text: ${filepath}\n// ${e.message}`;
            }
            editor.swapDoc(CodeMirror.Doc(content, 'text/plain'));
            editor.setOption("readOnly", true);
        } else {
            editor.swapDoc(fileData.doc);
            editor.setOption("readOnly", false);
            editor.setOption('mode', getModeForFilename(activeFilePath));
        }
        editor.focus();
    }
}

function logToConsole(type, content) { 
  if (isPreviewMode) {
      console[type === 'error' ? 'error' : 'log'](`[Preview] ${content}`);
      return;
  }
  const logElem = document.createElement('div'); logElem.className = type; logElem.textContent = content; consoleElem.appendChild(logElem); consoleElem.scrollTop = consoleElem.scrollHeight; 
}

function toggleEditor() {
    if (showingEditor) {
        editorElement.style.display = 'none';
        document.getElementById('file-tabs').style.display = 'none';
        document.querySelector('.live-update-switch').style.display = 'none';
        if (filePanel.classList.contains('open')) toggleFilePanel();
        scene.focus();
        scene.style.zIndex = '5';
        editorElement.style.pointerEvents = 'none';
        scene.style.pointerEvents = 'auto';
    } else {
        editorElement.style.display = 'block';
        document.getElementById('file-tabs').style.display = 'flex';
        document.querySelector('.live-update-switch').style.display = 'block';
        updateProjectTitle();
        editor.focus();
        scene.style.zIndex = '0';
        editorElement.style.pointerEvents = 'auto';
        scene.style.pointerEvents = 'none';
    }
    showingEditor = !showingEditor;
}
function toggleConsole() { consoleElem.style.display = showingConsole ? 'none' : 'block'; showingConsole = !showingConsole; }

function updateFileInfo() { if (isPreviewMode) return; getCodes().then(projects => { const totalSize = projects.reduce((acc, p) => acc + JSON.stringify(p.files).length, 0); const fileInfoEl = document.getElementById('fileInfo'); if(fileInfoEl) fileInfoEl.textContent = `${(totalSize/1024).toFixed(2)} KB, Projects: ${projects.length}`; }); }