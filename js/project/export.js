// js/project/export.js
async function exportProjectAsZip(projectId) {
try {
const project = await getProjectRecord(projectId);
if (project && project.files) {
const meta = getProjectMeta(projectId);
const resolvedFiles = await resolveProjectFilesForExport(project.files);
const zip = new JSZip();
for (const filename in resolvedFiles) {
if (filename.split('/').pop() === '.p') continue;
const fileData = resolvedFiles[filename];
if (!fileData) continue;
if (fileData.isBinary) {
const decompressed = fileData.content ? pako.ungzip(fileData.content) : new Uint8Array(0);
zip.file(filename, decompressed);
} else {
zip.file(filename, fileData.code || '');
}
}
zip.generateAsync({ type: "blob" }).then(function(content) {
const a = document.createElement("a");
const url = URL.createObjectURL(content);
a.href = url;
const rawName = (meta && meta.name) || project.name || `project-${project.id}`;
let projectName = rawName.replace(/[\\/:*?"<>|]/g, '_');
const rawVersion = (meta && meta.version) || project.version;
if (rawVersion) {
const versionNumber = rawVersion.substring(1).trim().replace(/[\\/:*?"<>|]/g, '_');
projectName += `(${versionNumber})`;
}
a.download = `${projectName}.zip`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
});
} else {
alert('Project data not found.');
}
} catch (error) {
console.error("Export function error:", error);
alert("An error occurred during export.");
}
}
async function exportAllProjectsAsZip() {
try {
const keys = await getAllProjectKeys();
if (!keys.length) {
alert("No saved projects to export.");
return;
}
const zip = new JSZip();
for (const id of keys) {
const project = await getProjectRecord(id);
if (!project || !project.files) continue;
const meta = getProjectMeta(id);
const rawName = (meta && meta.name) || project.name || `project-${project.id}`;
let folderName = rawName.replace(/[\\/:*?"<>|]/g, '_');
const rawVersion = (meta && meta.version) || project.version;
if (rawVersion) {
const versionNumber = rawVersion.substring(1).trim().replace(/[\\/:*?"<>|]/g, '_');
folderName += `(${versionNumber})`;
}
const projectFolder = zip.folder(folderName);
const resolvedFiles = await resolveProjectFilesForExport(project.files);
for (const filename in resolvedFiles) {
if (filename.split('/').pop() === '.p') continue;
if (projectFolder) {
const fileData = resolvedFiles[filename];
if (!fileData) continue;
if (fileData.isBinary) {
const decompressed = fileData.content ? pako.ungzip(fileData.content) : new Uint8Array(0);
projectFolder.file(filename, decompressed);
} else {
projectFolder.file(filename, fileData.code || '');
}
}
}
await new Promise(resolve => setTimeout(resolve, 0));
}
zip.generateAsync({ type: "blob" }).then(function(content) {
const a = document.createElement("a");
const url = URL.createObjectURL(content);
a.href = url;
a.download = `all_projects_export.zip`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
});
} catch (error) {
console.error("Error exporting all projects:", error);
alert("An error occurred while exporting all projects.");
}
}
function importProject() {
const input = document.createElement('input');
input.type = 'file';
input.multiple = true;
input.onchange = handleProjectImport;
input.click();
}
async function handleProjectImport(event) {
const selectedFiles = event.target.files;
if (!selectedFiles || selectedFiles.length === 0) {
return;
}
const newFileSet = {};
if (selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith('.zip')) {
const file = selectedFiles[0];
showNotification(`Importing from ${file.name}...`);
try {
const zipData = await file.arrayBuffer();
const zip = await JSZip.loadAsync(zipData);
const filePromises = [];
zip.forEach((relativePath, zipEntry) => {
if (zipEntry.dir) return;
const promise = (async () => {
const extension = zipEntry.name.split('.').pop().toLowerCase();
const isText = TEXT_EXTENSIONS.has(extension);
if (!isText) {
const content = await zipEntry.async('uint8array');
const compressed = pako.gzip(content);
const mimeMap = {
'jpg': 'image/jpeg',
'jpeg': 'image/jpeg',
'png': 'image/png',
'gif': 'image/gif',
'webp': 'image/webp',
'mp3': 'audio/mpeg',
'wav': 'audio/wav',
'ogg': 'audio/ogg',
'mp4': 'video/mp4',
'webm': 'video/webm'
};
newFileSet[relativePath] = {
isBinary: true,
mimeType: mimeMap[extension] || 'application/octet-stream',
content: compressed
};
} else {
const code = await zipEntry.async('string');
newFileSet[relativePath] = { code: code, isBinary: false };
}
})();
filePromises.push(promise);
});
await Promise.all(filePromises);
showNotification('Project imported successfully from ZIP.');
} catch (error) {
console.error('Error importing project from ZIP:', error);
showNotification('Error: Could not read the ZIP file.');
return;
}
} else {
showNotification(`Importing ${selectedFiles.length} file(s)...`);
const fileReadPromises = Array.from(selectedFiles).map(file => {
return new Promise((resolve, reject) => {
const reader = new FileReader();
const extension = file.name.split('.').pop().toLowerCase();
const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));
reader.onload = e => {
const path = file.name;
if (isText) {
newFileSet[path] = { code: e.target.result, isBinary: false };
} else {
const compressed = pako.gzip(new Uint8Array(e.target.result));
newFileSet[path] = {
isBinary: true,
mimeType: file.type || 'application/octet-stream',
content: compressed
};
}
resolve();
};
reader.onerror = e => reject(e);
if (isText) {
reader.readAsText(file);
} else {
reader.readAsArrayBuffer(file);
}
});
});
try {
await Promise.all(fileReadPromises);
showNotification('Files imported successfully.');
} catch (error) {
console.error('Error importing files:', error);
showNotification('Error: Could not read one or more files.');
return;
}
}
if (Object.keys(newFileSet).length > 0) {
currentProjectId = null;
const openTabsOnLoad = [];
const indexHtmlPath = Object.keys(newFileSet).find(key => key.toLowerCase() === 'index.html');
if (indexHtmlPath) {
openTabsOnLoad.push(indexHtmlPath);
}
initializeEditorWithFiles(newFileSet, openTabsOnLoad, null);
updateProjectTitle();
toggleMenu();
}
}
function importProjectFolder() {
const input = document.createElement('input');
input.type = 'file';
input.webkitdirectory = true;
input.onchange = handleFolderImport;
input.click();
}
async function handleFolderImport(event) {
const selectedFiles = event.target.files;
if (!selectedFiles || selectedFiles.length === 0) {
return;
}
const newFileSet = {};
const rootFolderName = selectedFiles[0].webkitRelativePath.split('/')[0];
showNotification(`Importing from folder ${rootFolderName}...`);
const fileReadPromises = Array.from(selectedFiles).map(file => {
return new Promise((resolve, reject) => {
const reader = new FileReader();
const extension = file.name.split('.').pop().toLowerCase();
const isText = TEXT_EXTENSIONS.has(extension) || (file.type && file.type.startsWith('text/'));
const relativePath = file.webkitRelativePath.substring(rootFolderName.length + 1);
if (!relativePath) {
resolve();
return;
}
reader.onload = e => {
if (isText) {
newFileSet[relativePath] = { code: e.target.result, isBinary: false };
} else {
const compressed = pako.gzip(new Uint8Array(e.target.result));
newFileSet[relativePath] = {
isBinary: true,
mimeType: file.type || 'application/octet-stream',
content: compressed
};
}
resolve();
};
reader.onerror = e => reject(e);
if (isText) {
reader.readAsText(file);
} else {
reader.readAsArrayBuffer(file);
}
});
});
try {
await Promise.all(fileReadPromises);
showNotification('Folder imported successfully.');
} catch (error) {
console.error('Error importing folder:', error);
showNotification('Error: Could not read one or more files from the folder.');
return;
}
if (Object.keys(newFileSet).length > 0) {
currentProjectId = null;
const openTabsOnLoad = [];
const indexHtmlPath = Object.keys(newFileSet).find(key => key.toLowerCase() === 'index.html');
if (indexHtmlPath) {
openTabsOnLoad.push(indexHtmlPath);
}
initializeEditorWithFiles(newFileSet, openTabsOnLoad, null);
updateProjectTitle();
toggleMenu();
}
}
