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
    launcherView.innerHTML = '';
    
    const shortcuts = getLauncherShortcuts();
    const allProjects = await getCodes();
    
    // Create icons based on stored coordinates
    const createIcon = (item, isEditor = false) => {
        const container = document.createElement('div');
        container.className = 'app-icon-container';
        container.style.left = (item.x * GRID_CELL_W) + 'px';
        container.style.top = (item.y * GRID_CELL_H) + 'px';
        container.draggable = true;

        if (isEditor) {
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
                updateScene();
            };
        } else {
            const project = allProjects.find(p => p.id === item.id);
            if (!project) return null; // Project deleted?

            const initials = (project.name || '?').substring(0, 2).toUpperCase();
            const hue = (project.id * 137.508) % 360; 
            const colorStyle = `hsl(${hue}, 60%, 40%)`;

            container.innerHTML = `
                <div class="app-icon" style="background-color: ${colorStyle}">${initials}</div>
                <div class="app-name">${project.name || 'Project'}</div>
            `;

            container.onmousedown = (e) => {
                if (e.button === 1) { // Middle click delete
                    e.preventDefault();
                    e.stopPropagation();
                    const newShortcuts = shortcuts.filter(s => s.id !== item.id);
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
                }
            };
        }

        // Drag handlers
        container.addEventListener('dragstart', (e) => {
            draggedLauncherItem = item;
            // Calculate offset to prevent "jump"
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

        launcherView.appendChild(container);
    };

    shortcuts.forEach(item => {
        if (item.id === 'editor') {
            createIcon(item, true);
        } else {
            createIcon(item, false);
        }
    });

    // Drop zone logic on the main view
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

        // Check collision/swap
        const targetItemIndex = shortcuts.findIndex(s => s.x === x && s.y === y);
        const sourceItemIndex = shortcuts.findIndex(s => s.id === draggedLauncherItem.id);

        if (sourceItemIndex === -1) return;

        if (targetItemIndex > -1 && targetItemIndex !== sourceItemIndex) {
            // Swap positions
            const targetItem = shortcuts[targetItemIndex];
            targetItem.x = draggedLauncherItem.x;
            targetItem.y = draggedLauncherItem.y;
            shortcuts[sourceItemIndex].x = x;
            shortcuts[sourceItemIndex].y = y;
        } else {
            // Move to empty space
            shortcuts[sourceItemIndex].x = x;
            shortcuts[sourceItemIndex].y = y;
        }

        saveLauncherShortcuts(shortcuts);
        renderLauncher();
        draggedLauncherItem = null;
    };
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
