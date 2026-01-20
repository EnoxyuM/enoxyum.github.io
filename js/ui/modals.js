function showInlineInput({ initialValue = '', placeholder = '', onSave, onCancel = () => {} }) {
    inlineInputContainer.style.display = 'block';
    inlineInputField.value = initialValue;
    inlineInputField.placeholder = placeholder;
    inlineInputField.focus();
    inlineInputField.select();

    const cleanup = () => {
        inlineInputContainer.style.display = 'none';
        inlineInputField.removeEventListener('keydown', handleKeydown);
        inlineInputField.removeEventListener('blur', handleBlur);
    };

    const handleSave = () => {
        const newValue = inlineInputField.value.trim();
        if (newValue) {
            onSave(newValue);
        } else {
            onCancel();
        }
        cleanup();
    };
    
    const handleCancel = () => {
        onCancel();
        cleanup();
    };

    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    const handleBlur = () => {
        handleSave();
    };

    inlineInputField.addEventListener('keydown', handleKeydown);
    inlineInputField.addEventListener('blur', handleBlur);
}

function toggleMenu() { 
    if (menu.style.display === 'none' || menu.style.display === '') { 
        menu.style.display = 'flex'; 
        loadSavedCodes(); 
    } else { 
        menu.style.display = 'none'; 
        colorPicker.style.display = 'none'; 
    } 
}

let draggedLauncherItem = null;
const GRID_CELL_W = 100;
const GRID_CELL_H = 120;

async function renderLauncher() {
    
    const shortcuts = getLauncherShortcuts();
    const allProjects = await getCodes();
    
    // Setup drop handlers only once
    if (!launcherView.getAttribute('data-drop-init')) {
        launcherView.setAttribute('data-drop-init', 'true');
        
        launcherView.ondragover = (e) => {
            e.preventDefault(); 
            e.dataTransfer.dropEffect = 'move';
        };

        launcherView.ondrop = (e) => {
            e.preventDefault();
            if (!draggedLauncherItem) return;

            // Calculate grid snap coordinates
            const x = Math.max(0, Math.floor(e.clientX / GRID_CELL_W));
            const y = Math.max(0, Math.floor(e.clientY / GRID_CELL_H));

            // Check bounds to prevent partial off-screen
            const maxCols = Math.floor(window.innerWidth / GRID_CELL_W);
            const maxRows = Math.floor(window.innerHeight / GRID_CELL_H);
            
            // If x is too far right, or y too far down
            if (x >= maxCols) return;
            if (y >= maxRows) return;

            const currentShortcuts = getLauncherShortcuts();
            
            // Check collision/swap
            const targetItemIndex = currentShortcuts.findIndex(s => s.x === x && s.y === y);
            const sourceItemIndex = currentShortcuts.findIndex(s => s.id === draggedLauncherItem.id);

            if (sourceItemIndex === -1) return;

            if (targetItemIndex > -1 && targetItemIndex !== sourceItemIndex) {
                // Swap positions
                const targetItem = currentShortcuts[targetItemIndex];
                targetItem.x = draggedLauncherItem.x;
                targetItem.y = draggedLauncherItem.y;
                currentShortcuts[sourceItemIndex].x = x;
                currentShortcuts[sourceItemIndex].y = y;
            } else {
                // Move to empty space
                currentShortcuts[sourceItemIndex].x = x;
                currentShortcuts[sourceItemIndex].y = y;
            }

            saveLauncherShortcuts(currentShortcuts);
            renderLauncher();
            draggedLauncherItem = null;
        };
    }

    // Reuse existing elements to prevent flicker
    const children = Array.from(launcherView.children);
    const childrenById = new Map();
    children.forEach(c => {
        if (c.dataset.id) childrenById.set(c.dataset.id, c);
    });
    const touchedIds = new Set();

    shortcuts.forEach(item => {
        const itemIdStr = String(item.id);
        touchedIds.add(itemIdStr);
        
        let container = childrenById.get(itemIdStr);
        let isNew = false;

        if (!container) {
            isNew = true;
            container = document.createElement('div');
            container.className = 'app-icon-container';
            container.draggable = true;
            container.dataset.id = itemIdStr;
            launcherView.appendChild(container);

            container.addEventListener('dragstart', (e) => {
                // Find latest item data
                const currentShortcuts = getLauncherShortcuts();
                const freshItem = currentShortcuts.find(s => String(s.id) === itemIdStr);
                draggedLauncherItem = freshItem || item;
                
                const rect = container.getBoundingClientRect();
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    id: item.id,
                    offsetX: e.clientX - rect.left,
                    offsetY: e.clientY - rect.top
                }));
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => container.classList.add('dragging'), 0);
            });

            container.addEventListener('dragend', () => {
                container.classList.remove('dragging');
                draggedLauncherItem = null;
            });
        }

        // Update position
        container.style.left = (item.x * GRID_CELL_W) + 'px';
        container.style.top = (item.y * GRID_CELL_H) + 'px';

        if (item.id === 'editor') {
            if (isNew || container.getAttribute('data-type') !== 'editor') {
                container.setAttribute('data-type', 'editor');
                container.innerHTML = `
                    <div class="app-icon editor-icon">📝</div>
                    <div class="app-name">Editor</div>
                `;
                container.onclick = () => {
                    isLauncherMode = false;
                    launcherView.style.display = 'none';
                    editorElement.style.display = 'block';
                    document.getElementById('file-tabs').style.display = 'flex';
                    document.querySelector('.live-update-switch').style.display = 'block';
                    if (scene) scene.style.pointerEvents = 'none';
                    editor.refresh();
                    updateScene();
                };
                container.onmousedown = null;
            }
        } else {
            const project = allProjects.find(p => p.id === item.id);
            if (!project) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';

            const projectName = project.name || 'Project';
            if (container.getAttribute('data-name') !== projectName || isNew) {
                container.setAttribute('data-name', projectName);
                const initials = (projectName || '?').substring(0, 2).toUpperCase();
                const hue = (project.id * 137.508) % 360; 
                const colorStyle = `hsl(${hue}, 60%, 40%)`;

                container.innerHTML = `
                    <div class="app-icon" style="background-color: ${colorStyle}">${initials}</div>
                    <div class="app-name">${projectName}</div>
                `;
            }

            // Reassign sensitive handlers
            container.onmousedown = (e) => {
                if (e.button === 1) { // Middle click delete
                    e.preventDefault();
                    e.stopPropagation();
                    const newShortcuts = getLauncherShortcuts().filter(s => s.id !== item.id);
                    saveLauncherShortcuts(newShortcuts);
                    renderLauncher();
                }
            };

            container.onclick = async () => {
                try {
                    launcherView.style.display = 'none';
                    isLauncherMode = true;
                    editorElement.style.display = 'none';
                    document.getElementById('file-tabs').style.display = 'none';
                    document.querySelector('.live-update-switch').style.display = 'none';
                    menu.style.display = 'none';
                    await loadProject(item.id);
                    updateScene(); 
                    scene.style.zIndex = '5';
                    scene.style.pointerEvents = 'auto';
                    scene.focus();
                } catch (e) {
                    console.error("Launcher error:", e);
                    showNotification("Failed to launch project");
                    isLauncherMode = false;
                    editorElement.style.display = 'block';
                    document.getElementById('file-tabs').style.display = 'flex';
                    document.querySelector('.live-update-switch').style.display = 'block';
                    if (scene) {
                        scene.style.zIndex = '0';
                        scene.style.pointerEvents = 'none';
                    }
                    editor.refresh();
                }
            };
        }
    });

    // Cleanup removed icons
    childrenById.forEach((node, id) => {
        if (!touchedIds.has(id)) {
            node.remove();
        }
    });
}

function toggleLauncher() {
    const isVisible = launcherView.style.display === 'block';
    if (isVisible) {
        if (isLauncherMode) {
            launcherView.style.display = 'none';
            scene.focus();
        } else {
            launcherView.style.display = 'none';
            editorElement.style.display = 'block';
            document.getElementById('file-tabs').style.display = 'flex';
            document.querySelector('.live-update-switch').style.display = 'block';
            editor.refresh();
            editor.focus();
        }
    } else {
        editorElement.style.display = 'none';
        document.getElementById('file-tabs').style.display = 'none';
        document.querySelector('.live-update-switch').style.display = 'none';
        menu.style.display = 'none';
        colorPicker.style.display = 'none';
        
        launcherView.style.display = 'block';
        renderLauncher();
    }
}
