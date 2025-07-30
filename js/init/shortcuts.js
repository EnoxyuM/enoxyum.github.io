function setupShortcuts() {
    document.addEventListener('keydown', e => { 
        if (e.key === 'Escape') { 
            toggleMenu(); 
        } else if (e.altKey && !e.shiftKey && !altPressed) { 
            e.preventDefault(); 
            altPressed = true; 
            toggleEditor(); 
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
                    toggleMenu(); 
                } else if (e.altKey && !e.shiftKey) { 
                    e.preventDefault(); 
                    toggleEditor(); 
                } else if (e.altKey && e.shiftKey) { 
                    e.preventDefault(); 
                    toggleConsole(); 
                } 
            });
        }
    });
}