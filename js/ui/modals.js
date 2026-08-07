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

function removeLauncherShortcut(id) {
    const shortcuts = getLauncherShortcuts().filter(s => {
        return s.id !== id && String(s.id) !== String(id);
    });

    saveLauncherShortcuts(shortcuts);

    if (launcherView.style.display === 'block') {
        renderLauncher();
    }
}

async function renderLauncher() {
    const shortcuts = getLauncherShortcuts();

    const maxCols = Math.floor(window.innerWidth / GRID_CELL_W);
    const gridWidth = maxCols * GRID_CELL_W;
    const gridOffsetX = Math.max(0, (window.innerWidth - gridWidth) / 2);

    if (!launcherView.getAttribute('data-drop-init')) {
        launcherView.setAttribute('data-drop-init', 'true');

        window.addEventListener('resize', () => {
            if (launcherView.style.display === 'block') {
                renderLauncher();
            }
        });

        launcherView.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };

        launcherView.ondrop = (e) => {
            e.preventDefault();

            if (!draggedLauncherItem) return;

            const curMaxCols = Math.floor(window.innerWidth / GRID_CELL_W);
            const curGridWidth = curMaxCols * GRID_CELL_W;
            const curOffsetX = Math.max(0, (window.innerWidth - curGridWidth) / 2);

            const x = Math.max(0, Math.floor((e.clientX - curOffsetX) / GRID_CELL_W));
            const y = Math.max(0, Math.floor(e.clientY / GRID_CELL_H));

            const maxRows = Math.floor(window.innerHeight / GRID_CELL_H);

            if (x >= curMaxCols) return;
            if (y >= maxRows) return;

            const currentShortcuts = getLauncherShortcuts();

            const targetItemIndex = currentShortcuts.findIndex(s => s.x === x && s.y === y);
            const sourceItemIndex = currentShortcuts.findIndex(s => s.id === draggedLauncherItem.id);

            if (sourceItemIndex === -1) return;

            if (targetItemIndex > -1 && targetItemIndex !== sourceItemIndex) {
                const targetItem = currentShortcuts[targetItemIndex];
                targetItem.x = draggedLauncherItem.x;
                targetItem.y = draggedLauncherItem.y;

                currentShortcuts[sourceItemIndex].x = x;
                currentShortcuts[sourceItemIndex].y = y;
            } else {
                currentShortcuts[sourceItemIndex].x = x;
                currentShortcuts[sourceItemIndex].y = y;
            }

            saveLauncherShortcuts(currentShortcuts);
            renderLauncher();

            draggedLauncherItem = null;
        };
    }

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

        container.style.left = (item.x * GRID_CELL_W + gridOffsetX) + 'px';
        container.style.top = (item.y * GRID_CELL_H) + 'px';

        if (item.id === 'editor') {
            if (isNew || container.getAttribute('data-type') !== 'editor') {
                container.setAttribute('data-type', 'editor');

                container.innerHTML = `
                    <div class="app-icon editor-icon">📝</div>
                    <div class="app-name">Editor</div>
                `;

                container.onclick = async () => {
                    isLauncherMode = false;
                    launcherView.style.display = 'none';

                    editorElement.style.display = 'block';
                    document.getElementById('file-tabs').style.display = 'flex';
                    document.querySelector('.live-update-switch').style.display = 'block';

                    try {
                        if (typeof ensureEditorProjectLoaded === 'function') {
                            await ensureEditorProjectLoaded();
                        }
                    } catch (e) {
                        console.error('Could not load editor project:', e);
                    }

                    if (scene) scene.style.pointerEvents = 'none';

                    editor.refresh();

                    if (liveUpdateToggle.checked) {
                        updateScene();
                    }
                };

                container.onmousedown = null;
            }
        } else {
            const meta = getProjectMeta(item.id);

            if (!meta) {
                container.style.display = 'none';
                return;
            }

            if (meta.inTrash) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'flex';

            const projectName = meta.name || `Project ${item.id}`;

            if (container.getAttribute('data-name') !== projectName || isNew) {
                container.setAttribute('data-name', projectName);

                const initials = (projectName || '?').substring(0, 2).toUpperCase();

                const numericId = Number(item.id);
                const hue = (Number.isFinite(numericId) ? numericId : 0) * 137.508 % 360;
                const colorStyle = `hsl(${hue}, 60%, 40%)`;

                container.innerHTML = `
                    <div class="app-icon" style="background-color: ${colorStyle}">${initials}</div>
                    <div class="app-name">${projectName}</div>
                `;
            }

            container.onmousedown = (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    removeLauncherShortcut(item.id);
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

                    removeLauncherShortcut(item.id);

                    isLauncherMode = false;
                    launcherView.style.display = 'block';

                    editorElement.style.display = 'none';
                    document.getElementById('file-tabs').style.display = 'none';
                    document.querySelector('.live-update-switch').style.display = 'none';

                    renderLauncher();
                }
            };
        }
    });

    childrenById.forEach((node, id) => {
        if (!touchedIds.has(id)) {
            node.remove();
        }
    });
}

async function toggleLauncher() {
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

            try {
                if (typeof ensureEditorProjectLoaded === 'function') {
                    await ensureEditorProjectLoaded();
                }
            } catch (e) {
                console.error('Could not load editor project:', e);
            }

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