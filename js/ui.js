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

function checkOverflow() {
    if (isPreviewMode) return;
    const addBtn = document.getElementById('add-file-btn');
    if (!addBtn || !tabsContainer) return;

    const TAB_FULL_WIDTH = 232;
    const TAB_MARGIN = 2;

    const requiredSpace = (openTabs.length * (TAB_FULL_WIDTH + TAB_MARGIN)) + addBtn.offsetWidth;
    const availableSpace = tabsContainer.clientWidth - 20;

    if (requiredSpace > availableSpace) {
        tabsContainer.classList.add('tabs-overflow');
    } else {
        tabsContainer.classList.remove('tabs-overflow');
    }
}

function renderTabs() {
    tabsWrapper.innerHTML = '';
    
    openTabs.forEach(filepath => {
        if (!files[filepath]) return;
        
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.filepath = filepath;
        
        const shortName = filepath.split('/').pop();
        tab.title = filepath;

        const tabTextSpan = document.createElement('span');
        tabTextSpan.textContent = shortName;
        tab.appendChild(tabTextSpan);

        if (filepath.toLowerCase() !== 'index.html') tab.draggable = true;
        if (filepath === activeFilePath) tab.classList.add('active');

        tab.onclick = () => switchTab(filepath);

        tab.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                closeTab(filepath);
            }
        });
        
        tab.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (filepath.toLowerCase() === 'index.html') {
                showNotification("Cannot rename index.html.");
                return;
            }
            renameItem(filepath, false);
        });

        tab.addEventListener('dragstart', () => setTimeout(() => tab.classList.add('dragging'), 0));
        tab.addEventListener('dragend', () => tab.classList.remove('dragging'));

        tabsWrapper.appendChild(tab);
    });
    
    setTimeout(checkOverflow, 0);
}

function switchTab(filepath) {
    if (filepath === activeFilePath || !files[filepath]) return;
    if (activeFilePath && files[activeFilePath]) files[activeFilePath].code = editor.getValue();

    activeFilePath = filepath;
    editor.swapDoc(files[filepath].doc);
    editor.setOption('mode', getModeForFilename(activeFilePath));
    renderAll(); 
    editor.focus();
}

function openFile(filepath) {
    if (!files[filepath]) return;
    if (!openTabs.includes(filepath)) {
        openTabs.push(filepath);
    }
    switchTab(filepath);
}

function closeTab(filepath) {
    if (filepath.toLowerCase() === 'index.html') {
        alert("Cannot close index.html.");
        return;
    }
    
    const index = openTabs.indexOf(filepath);
    if (index > -1) {
        openTabs.splice(index, 1);
    }

    if (activeFilePath === filepath) {
        const newActiveIndex = Math.max(0, index - 1);
        const newActiveFile = openTabs.length > 0 ? openTabs[newActiveIndex] : null;
        if (newActiveFile) {
            switchTab(newActiveFile);
        } else {
            activeFilePath = null;
            editor.setValue('');
            renderAll();
        }
    } else {
        renderAll();
    }
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.tab[draggable="true"]:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function toggleFilePanel() {
    filePanel.classList.toggle('open');
    editorElement.classList.toggle('file-panel-open');
    document.getElementById('file-tabs').classList.toggle('file-panel-open');
    setTimeout(() => { editor.refresh(); checkOverflow(); }, 300);
}

function renderFilePanel() {
    if (isPreviewMode) return;
    filePanel.innerHTML = '';
    const paths = Object.keys(files);
    const tree = {};

    paths.forEach(path => {
        let currentLevel = tree;
        path.split('/').forEach((part, index, arr) => {
            if (index === arr.length - 1) {
                currentLevel[part] = { _is_file_: true, path: path };
            } else {
                if (!currentLevel[part]) currentLevel[part] = {};
                currentLevel = currentLevel[part];
            }
        });
    });

    function renderTree(node, container, depth) {
        Object.keys(node).sort().forEach(key => {
            if (key === '_is_file_' || key === '.p') return;
            const item = node[key];
            const div = document.createElement('div');
            div.style.paddingLeft = `${10 + depth * 15}px`;
            
            if (item._is_file_) {
                div.className = 'file-entry file';
                div.textContent = key;
                div.dataset.path = item.path;
                if (item.path === activeFilePath) div.classList.add('active');
                div.onclick = () => openFile(item.path);
            } else {
                div.className = 'file-entry folder';
                div.textContent = key;
                const currentPath = Object.values(item).find(v => v.path)?.path.substring(0, Object.values(item).find(v => v.path).path.indexOf(key) + key.length) || key;
                div.dataset.path = currentPath;
                renderTree(item, div, depth + 1);
            }
            container.appendChild(div);
        });
    }

    renderTree(tree, filePanel, 0);
    
    filePanel.addEventListener('contextmenu', e => {
        e.preventDefault();
        const target = e.target.closest('.file-entry');
        const path = target ? target.dataset.path : '';
        const isFolder = target ? target.classList.contains('folder') : true;
        showContextMenu(e.clientX, e.clientY, path, isFolder);
    });
}

function showContextMenu(x, y, path, isFolder) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';

    let menuItems = `<div id="ctx-new-file">New File</div><div id="ctx-new-folder">New Folder</div>`;
    if (path && path.toLowerCase() !== 'index.html') {
        menuItems += `<div id="ctx-rename">Rename</div><div id="ctx-delete">Delete</div>`;
    }
    contextMenu.innerHTML = menuItems;

    document.getElementById('ctx-new-file').onclick = () => createNewItem(false, isFolder ? path : path.substring(0, path.lastIndexOf('/')));
    document.getElementById('ctx-new-folder').onclick = () => createNewItem(true, isFolder ? path : path.substring(0, path.lastIndexOf('/')));
    if (path && path.toLowerCase() !== 'index.html') {
        document.getElementById('ctx-rename').onclick = () => renameItem(path, isFolder);
        document.getElementById('ctx-delete').onclick = () => deleteItem(path, isFolder);
    }
}

function createNewItem(isFolder, basePath) {
    const type = isFolder ? 'folder' : 'file';
    let name = prompt(`Enter new ${type} name:`);
    if (!name) return;
    const newPath = basePath ? `${basePath}/${name}`.replace(/^\//, '') : name;

    if (isFolder) {
        const placeholderPath = `${newPath}/.p`;
        if (files[placeholderPath]) { alert('Folder already exists.'); return; }
        files[placeholderPath] = { code: '', doc: CodeMirror.Doc('', 'text/plain')};
    } else {
        if (files[newPath]) { alert('File already exists.'); return; }
        files[newPath] = { code: '', doc: CodeMirror.Doc('', getModeForFilename(newPath))};
        openFile(newPath);
    }
    renderAll();
}

function renameItem(oldPath, isFolder) {
    const oldName = oldPath.split('/').pop();
    const newName = prompt('Enter new name:', oldName);
    if (!newName || newName === oldName) return;

    const basePath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = basePath ? `${basePath}/${newName}` : newName;

    if (isFolder) {
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
        if (files[newPath]) { alert('A file with that name already exists.'); return; }
        files[newPath] = files[oldPath];
        delete files[oldPath];
        const openTabIndex = openTabs.indexOf(oldPath);
        if (openTabIndex > -1) openTabs[openTabIndex] = newPath;
        if (activeFilePath === oldPath) activeFilePath = newPath;
    }
    renderAll();
}

function deleteItem(pathToDelete, isFolder) {
    if (!confirm(`Are you sure you want to delete "${pathToDelete}"? This cannot be undone.`)) return;
    
    if (isFolder) {
        Object.keys(files).forEach(path => {
            if (path.startsWith(pathToDelete + '/')) {
                closeTab(path);
                delete files[path];
            }
        });
    } else {
        closeTab(pathToDelete);
        delete files[pathToDelete];
    }
    renderAll();
}

function logToConsole(type, content) { 
  if (isPreviewMode) {
      console[type === 'error' ? 'error' : 'log'](`[Preview] ${content}`);
      return;
  }
  const logElem = document.createElement('div'); logElem.className = type; logElem.textContent = content; consoleElem.appendChild(logElem); consoleElem.scrollTop = consoleElem.scrollHeight; 
}

let showingEditor = false, showingConsole = false;
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

function toggleMenu() { 
    if (menu.style.display === 'none' || menu.style.display === '') { 
        menu.style.display = 'flex'; 
        loadSavedCodes(); 
    } else { 
        menu.style.display = 'none'; 
        colorPicker.style.display = 'none'; 
    } 
}
const colorTypes = { Comment: 'comment', Keyword: 'keyword', String: 'string', Number: 'number', Special: 'atom', Variable: 'variable', Property: 'property', Definition: 'def', Function: 'variable-2', Operator: 'operator', HTMLBracket: 'bracket', HighlightedBracket: 'matchingbracket', Class: 'variable-3', Regex: 'string-2', HTMLTag: 'tag', HTMLAttribute: 'attribute', OtherText: 'text' };
const defaultColors = {"Comment":"#04ff00","Keyword":"#0064ff","String":"#ffff00","Number":"#ffffff","Special":"#ff00ae","Variable":"#c880ff","Property":"#757ad7","Definition":"#ff8000","Function":"#00b3ff","Operator":"#ffffff","HTMLBracket":"#fe2aec","HighlightedBracket":"#ff0000","Class":"#00ff88","Regex":"#ff00ff","HTMLTag":"#00b3ff","HTMLAttribute":"#ff7aff","OtherText":"#878787"};
function changeColor(type) { const color = document.getElementById(type).value; const style = document.createElement('style'); document.head.appendChild(style); const sheet = style.sheet; if (type === 'HighlightedBracket') sheet.insertRule(`.cm-s-monokai .CodeMirror-${colorTypes[type]} { background-color: ${color} !important; color: #000000 !important; }`, 0); else if (type === 'OtherText') sheet.insertRule(`.cm-s-monokai { color: ${color} !important; }`, 0); else sheet.insertRule(`.cm-s-monokai span.cm-${colorTypes[type]} { color: ${color} !important; }`, 0); localStorage.setItem(`color-${type}`, color); }
function loadColors() { for (const type in colorTypes) { const color = localStorage.getItem(`color-${type}`) || defaultColors[type]; if (color) { document.getElementById(type).value = color; changeColor(type); } } }
function exportSettings() { const settings = {}; for (const type in colorTypes) settings[type] = localStorage.getItem(`color-${type}`); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(settings)], {type: "application/json"})); a.download = "code_editor_settings.json"; a.click(); URL.revokeObjectURL(a.href); }
function importSettings() { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'; input.onchange = e => { const file = e.target.files[0]; const reader = new FileReader(); reader.onload = e => { const settings = JSON.parse(e.target.result); for (const type in settings) if (colorTypes.hasOwnProperty(type)) { localStorage.setItem(`color-${type}`, settings[type]); document.getElementById(type).value = settings[type]; changeColor(type); } }; reader.readAsText(file); }; input.click(); }
function updateFileInfo() { if (isPreviewMode) return; getCodes().then(projects => { const totalSize = projects.reduce((acc, p) => acc + JSON.stringify(p.files).length, 0); const fileInfoEl = document.getElementById('fileInfo'); if(fileInfoEl) fileInfoEl.textContent = `${(totalSize/1024).toFixed(2)} KB, Projects: ${projects.length}`; }); }