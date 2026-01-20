function setupShortcuts() {
    document.addEventListener('keydown', e => { 
        if (e.key === 'Escape') { 
            if (isLauncherMode) {
                e.preventDefault();
                toggleLauncher(); // Toggle between scene and launcher
            } else {
                toggleMenu(); 
            }
        } else if (e.ctrlKey && e.altKey && !e.shiftKey && !altPressed) { 
            if (!isLauncherMode) {
                e.preventDefault(); 
                altPressed = true; 
                toggleEditor();
            }
        } else if (e.altKey && e.shiftKey && !shiftAltPressed) { 
            e.preventDefault(); 
            shiftAltPressed = true; 
            toggleConsole(); 
        } 
    });

    document.addEventListener('keyup', e => { 
        if (!e.altKey) { 
            altPressed = false; 
            shiftAltPressed = false; 
        } 
    });
    
    scene.addEventListener('load', () => {
        if (scene.contentWindow) {
            scene.contentWindow.addEventListener('keydown', e => { 
                if (e.key === 'Escape') { 
                    e.preventDefault(); 
                    if (isLauncherMode) {
                        toggleLauncher();
                    } else {
                        toggleMenu(); 
                    }
                } else if (e.ctrlKey && e.altKey && !e.shiftKey) { 
                    if (!isLauncherMode) {
                        e.preventDefault(); 
                        toggleEditor(); 
                    }
                } else if (e.altKey && e.shiftKey) { 
                    e.preventDefault(); 
                    toggleConsole(); 
                } 
            });
        }
    });
}
