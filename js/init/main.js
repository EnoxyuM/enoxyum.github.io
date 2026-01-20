if (!isPreviewMode) {
    setupCodeMirror();
    setupEventListeners();
    setupShortcuts();
    setupDragDrop();

    editorElement.style.display = 'none'; 
    document.getElementById('file-tabs').style.display = 'none';
    document.querySelector('.live-update-switch').style.display = 'none';

    consoleElem.style.display = 'none'; 
    scene.style.zIndex = '0'; 
    editorElement.style.pointerEvents = 'auto'; 
    scene.style.pointerEvents = 'none'; 
    showingEditor = true;

    openDB().then(async () => {
        loadBasket();
        if (await loadFromUrlHash()) {
            loadColors();
            editorElement.style.display = 'block'; 
            document.getElementById('file-tabs').style.display = 'flex';
            document.querySelector('.live-update-switch').style.display = 'block';
            editor.refresh();
            editor.focus();
            return;
        }

        loadColors();
        toggleLauncher();

        const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');
        if (lastOpenedIdStr) {
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(lastOpenedId);
            request.onsuccess = e => {
                if (e.target.result) { 
                    loadProject(lastOpenedId); 
                } else { 
                    localStorage.removeItem('lastOpenedProjectId'); 
                    loadFallbackProject(); 
                }
            };
            request.onerror = e => { 
                console.error("Error checking last project:", e); 
                localStorage.removeItem('lastOpenedProjectId'); 
                loadFallbackProject(); 
            };
        } else {
            loadFallbackProject();
        }
    });

} else {
    setupPreviewMode();
}
function formatDate(d) {const s=(new Date()-d)/1000;if(s<60)return`${Math.round(s)}s`;if(s<3600)return`${Math.round(s/60)}m`;if(s<86400)return`${Math.round(s/3600)}h`;return`${Math.round(s/86400)}d`;}
