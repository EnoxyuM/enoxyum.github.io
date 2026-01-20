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

async function renderLauncher() {
    launcherView.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'app-grid';
    
    // Editor Icon
    const editorContainer = document.createElement('div');
    editorContainer.className = 'app-icon-container';
    editorContainer.innerHTML = `
        <div class="app-icon editor-icon">📝</div>
        <div class="app-name">Editor</div>
    `;
    editorContainer.onclick = () => {
        isLauncherMode = false;
        launcherView.style.display = 'none';
        editorElement.style.display = 'block';
        document.getElementById('file-tabs').style.display = 'flex';
        document.querySelector('.live-update-switch').style.display = 'block';
        if (scene) scene.style.pointerEvents = 'none';
        updateScene();
    };
    grid.appendChild(editorContainer);

    const shortcuts = getLauncherShortcuts();
    const allProjects = await getCodes();
    
    shortcuts.forEach(id => {
        const project = allProjects.find(p => p.id === id);
        if (project) {
            const appContainer = document.createElement('div');
            appContainer.className = 'app-icon-container';
            const initials = (project.name || '?').substring(0, 2).toUpperCase();
            
            // Generate a persistent color based on project ID
            const hue = (project.id * 137.508) % 360; 
            const colorStyle = `hsl(${hue}, 60%, 40%)`;

            appContainer.innerHTML = `
                <div class="app-icon" style="background-color: ${colorStyle}">${initials}</div>
                <div class="app-name">${project.name || 'Project'}</div>
            `;
            
            // Remove from launcher on middle click
            appContainer.onmousedown = (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const newShortcuts = shortcuts.filter(sid => sid !== id);
                    saveLauncherShortcuts(newShortcuts);
                    renderLauncher();
                }
            };

            appContainer.onclick = async () => {
                try {
                    launcherView.style.display = 'none';
                    isLauncherMode = true;
                    
                    editorElement.style.display = 'none';
                    document.getElementById('file-tabs').style.display = 'none';
                    document.querySelector('.live-update-switch').style.display = 'none';
                    menu.style.display = 'none';
                    
                    await loadProject(id);
                    updateScene(); 
                    scene.style.zIndex = '5';
                    scene.style.pointerEvents = 'auto';
                    scene.focus();
                } catch (e) {
                    console.error("Launcher error:", e);
                    showNotification("Failed to launch project");
                    // Revert UI to editor mode if failed
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
            grid.appendChild(appContainer);
        }
    });

    launcherView.appendChild(grid);
}

function toggleLauncher() {
    const isVisible = launcherView.style.display === 'block';
    if (isVisible) {
        // Hiding launcher - Determine where to go based on state
        if (isLauncherMode) {
            // If in launcher mode, go back to the running project scene
            launcherView.style.display = 'none';
            scene.focus();
        } else {
            // Go back to editor
            launcherView.style.display = 'none';
            editorElement.style.display = 'block';
            document.getElementById('file-tabs').style.display = 'flex';
            document.querySelector('.live-update-switch').style.display = 'block';
            editor.focus();
        }
    } else {
        // Showing launcher
        // Hide everything else
        editorElement.style.display = 'none';
        document.getElementById('file-tabs').style.display = 'none';
        document.querySelector('.live-update-switch').style.display = 'none';
        menu.style.display = 'none';
        colorPicker.style.display = 'none';
        
        launcherView.style.display = 'block';
        renderLauncher();
    }
}
