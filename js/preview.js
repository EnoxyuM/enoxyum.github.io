function getModeForFilename(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.html')) return 'htmlmixed';
    if (filename.endsWith('.css')) return 'css';
    return 'text/plain';
}

function resolveInjections(code, processingStack = new Set()) {
    const injectionRegex = /\/\/\s*<<"([^"]+)"/g;
    return code.replace(injectionRegex, (match, path) => {
        const trimmedPath = path.trim();
        if (processingStack.has(trimmedPath)) {
            const errorMsg = `Circular dependency detected: ${[...processingStack, trimmedPath].join(' -> ')}`;
            logToConsole('error', errorMsg);
            return `console.error(${JSON.stringify(errorMsg)});`;
        }
        if (!files[trimmedPath]) {
            const errorMsg = `Injection error: File "${trimmedPath}" not found.`;
            logToConsole('error', errorMsg);
            return `console.error(${JSON.stringify(errorMsg)});`;
        }
        if (files[trimmedPath].isBinary) {
            const errorMsg = `Injection error: Cannot inject binary file "${trimmedPath}" into a text file.`;
            logToConsole('error', errorMsg);
            return `console.error(${JSON.stringify(errorMsg)});`;
        }
        processingStack.add(trimmedPath);
        const injectedContent = files[trimmedPath].code;
        const resolvedInjectedContent = resolveInjections(injectedContent, processingStack);
        processingStack.delete(trimmedPath);
        return resolvedInjectedContent;
    });
}

function updateScene() {
    blobUrls.forEach(url => URL.revokeObjectURL(url));
    blobUrls.length = 0;

    if (!isPreviewMode && activeFilePath && files[activeFilePath] && !files[activeFilePath].isBinary) {
        files[activeFilePath].code = editor.getValue();
    }

    const filePathToBlobUrl = {};
    for (const path in files) {
        if (!files.hasOwnProperty(path)) continue;

        const fileData = files[path];
        let blob;

        if (fileData.isBinary) {
            try {
                const decompressed = pako.ungzip(fileData.content);
                blob = new Blob([decompressed], { type: fileData.mimeType });
            } catch (e) {
                console.error(`Error processing binary file ${path}:`, e);
                continue;
            }
        } else {
            let content = fileData.code || '';
            let mimeType = 'text/plain';
            const lowerPath = path.toLowerCase();
            
            if (lowerPath.endsWith('.js') || lowerPath.endsWith('.html')) {
                content = resolveInjections(content, new Set([path]));
            }
            
            if (lowerPath.endsWith('.js')) mimeType = 'application/javascript';
            else if (lowerPath.endsWith('.css')) mimeType = 'text/css';
            else if (lowerPath.endsWith('.html')) mimeType = 'text/html';

            blob = new Blob([content], { type: mimeType });
        }
        
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        filePathToBlobUrl[path] = url;
    }

    const indexHtmlPath = Object.keys(files).find(key => key.toLowerCase() === 'index.html');
    let htmlCode;

    if (indexHtmlPath && files[indexHtmlPath]) {
        htmlCode = resolveInjections(files[indexHtmlPath].code, new Set([indexHtmlPath]));
    } else {
        htmlCode = '<p style="color:red;">Error: index.html not found.</p>';
    }

    const doc = new DOMParser().parseFromString(htmlCode, 'text/html');
    const tagsAndAttributes = {
        'script': 'src',
        'link[rel="stylesheet"]': 'href',
        'img': 'src',
        'audio': 'src',
        'video': 'src',
        'source': 'src',
        'embed': 'src',
        'object': 'data',
        'a': 'href'
    };

    for (const selector in tagsAndAttributes) {
        const attrName = tagsAndAttributes[selector];
        doc.querySelectorAll(selector).forEach(tag => {
            const path = tag.getAttribute(attrName);
            if (path && filePathToBlobUrl[path]) {
                tag.setAttribute(attrName, filePathToBlobUrl[path]);
            }
        });
    }

    const dynamicLoaderScript = `
        <script>
            const fileMap = ${JSON.stringify(filePathToBlobUrl)};
            const baseOrigin = new URL(window.location.href).origin;

            function getProjectPath(url) {
                try {
                    const urlStr = String(url);
                    const resolvedUrl = new URL(urlStr, baseOrigin + '/');
                    
                    if (resolvedUrl.origin === baseOrigin) {
                        const path = resolvedUrl.pathname.substring(1);
                        if (fileMap[path]) {
                           return path;
                        }
                    }
                    
                    if (fileMap[urlStr]) {
                        return urlStr;
                    }
                } catch(e) {
                     if (fileMap[String(url)]) {
                        return String(url);
                    }
                }
                return null;
            }

            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
                const requestUrl = (input instanceof Request) ? input.url : String(input);
                const projectPath = getProjectPath(requestUrl);
                
                if (projectPath && fileMap[projectPath]) {
                    return originalFetch.call(window, fileMap[projectPath], init);
                }
                return originalFetch.apply(window, arguments);
            };

            const originalXHROpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                const projectPath = getProjectPath(String(url));
                const finalUrl = (projectPath && fileMap[projectPath]) ? fileMap[projectPath] : url;
                return originalXHROpen.call(this, method, finalUrl, ...rest);
            };
            
            const imageDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if (imageDescriptor) {
                Object.defineProperty(HTMLImageElement.prototype, 'src', {
                    ...imageDescriptor,
                    set(url) {
                        const projectPath = getProjectPath(String(url));
                        const finalUrl = (projectPath && fileMap[projectPath]) ? fileMap[projectPath] : url;
                        return imageDescriptor.set.call(this, finalUrl);
                    }
                });
            }
        <\/script>
    `;

    const finalHtml = doc.documentElement.outerHTML;
    let finalSrcDoc;

    if (isPreviewMode) {
        finalSrcDoc = dynamicLoaderScript + finalHtml;
    } else {
        const errorAndLogHandlers = `<script>
            window.onerror = (m,s,l,c,e) => { window.parent.postMessage({type: 'error', content: 'Error: ' + m}, '*'); return true; };
            const oL=console.log; console.log = (...a) => { window.parent.postMessage({type:'log', content:a.join(' ')},'*'); oL.apply(this,a);};
            const oE=console.error; console.error = (...a) => { window.parent.postMessage({type:'error', content:a.join(' ')},'*'); oE.apply(this,a);};
            window.addEventListener('beforeunload', e => e.stopImmediatePropagation());
        <\/script>`;
        finalSrcDoc = errorAndLogHandlers + dynamicLoaderScript + finalHtml;
    }
    
    scene.srcdoc = finalSrcDoc;
}