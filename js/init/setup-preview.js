function setupPreviewMode() {
    editorElement.remove();
    if (location.hash.startsWith('#t=')) {
        try {
            const encodedData = location.hash.substring(3);
            const compressedBytes = decodeBaseCustom(encodedData);
            const decompressed = pako.ungzip(compressedBytes);
            const binaryData = new Uint8Array(decompressed);
            const { filesToLoad } = deserializeProjectOptimized(binaryData);

            if (Object.keys(filesToLoad).length > 0) {
                files = filesToLoad;
                updateScene();
            } else {
                 scene.srcdoc = `<h1>Error</h1><p>Error loading from URL</p>`;
            }
        } catch(e) {
            console.error("URL load error:", e);
            scene.srcdoc = `<h1>Error</h1><p>Invalid preview link</p>`;
        }
    } else {
        openDB().then(() => {
            const lastOpenedIdStr = localStorage.getItem('lastOpenedProjectId');
            if (!lastOpenedIdStr) {
                scene.srcdoc = "<h1>Error</h1><p>No project ID found in local storage. Please run a project from the editor first</p>";
                return;
            }
            const lastOpenedId = parseInt(lastOpenedIdStr, 10);
            const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(lastOpenedId);
            request.onsuccess = e => {
                const project = e.target.result;
                if (project && project.files) {
                    files = project.files;
                    updateScene();
                } else {
                    scene.srcdoc = `<h1>Error</h1><p>Project with ID ${lastOpenedId} not found</p>`;
                }
            };
            request.onerror = e => {
                scene.srcdoc = `<h1>Error</h1><p>Could not access the project database</p>`;
            }
        });
    }
}