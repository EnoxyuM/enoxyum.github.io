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

    if (activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
        files[activeFilePath].code = editor.getValue();
    }

    activeFilePath = filepath;

    updateEditorView(filepath);

    const pathParts = filepath.split('/');
    let currentPath = '';
    for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        openFolders.add(currentPath);
    }
    
    renderAll();
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
    
    forceOpenAsText.delete(filepath);

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