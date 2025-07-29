function getModeForFilename(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.html')) return 'htmlmixed';
    if (filename.endsWith('.css')) return 'css';
    return 'text/plain';
}

function resolveInjections(code, processingStack = new Set()) {
    const injectionRegex = /\/\/\s*<<\s*([\w\d\._\/-]+)/g;
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

    if (!isPreviewMode && activeFilePath && files[activeFilePath]) {
        files[activeFilePath].code = editor.getValue();
    }
    
    const fileKeys = Object.keys(files);
    const indexHtmlPath = fileKeys.find(key => key.toLowerCase() === 'index.html');

    let htmlCode;
    if (indexHtmlPath && files[indexHtmlPath]) {
        htmlCode = files[indexHtmlPath].code;
        htmlCode = resolveInjections(htmlCode, new Set([indexHtmlPath]));
    } else {
        htmlCode = '<p style="color:red;">Error: index.html not found.</p>';
    }

    const doc = new DOMParser().parseFromString(htmlCode, 'text/html');

    doc.querySelectorAll('script[src]').forEach(tag => {
        const src = tag.getAttribute('src');
        if (src && files[src]) {
            const processedCode = resolveInjections(files[src].code, new Set([src]));
            const blob = new Blob([processedCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            blobUrls.push(url);
            tag.src = url;
        }
    });

    doc.querySelectorAll('link[rel="stylesheet"][href]').forEach(tag => {
        const href = tag.getAttribute('href');
        if (files[href]) {
            const blob = new Blob([files[href].code], { type: 'text/css' });
            const url = URL.createObjectURL(blob);
            blobUrls.push(url);
            tag.href = url;
        }
    });

    const finalHtml = doc.documentElement.outerHTML;
    if (isPreviewMode) {
        scene.srcdoc = finalHtml;
    } else {
        const wrappedCode= `<script>
            window.onerror = (m,s,l,c,e) => { window.parent.postMessage({type: 'error', content: 'Error: ' + m}, '*'); return true; };
            const oL=console.log; console.log = (...a) => { window.parent.postMessage({type:'log', content:a.join(' ')},'*'); oL.apply(this,a);};
            const oE=console.error; console.error = (...a) => { window.parent.postMessage({type:'error', content:a.join(' ')},'*'); oE.apply(this,a);};
            window.addEventListener('beforeunload', e => e.stopImmediatePropagation());
        <\/script>` + finalHtml;
        scene.srcdoc = wrappedCode;
    }
}