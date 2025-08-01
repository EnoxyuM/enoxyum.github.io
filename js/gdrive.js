const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let gdriveFolderId = null;

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    checkInitStatus();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    checkInitStatus();
}

function trySilentLogin() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            return;
        }
        showNotification('Successfully signed in to Google.');
    };
}

function checkInitStatus() {
    if (gapiInited && gisInited) {
        const gdriveAuthBtn = document.getElementById('gdriveAuthBtn');
        if (gdriveAuthBtn) {
            gdriveAuthBtn.disabled = false;
        }
        trySilentLogin();
    }
}

function handleAuthClick() {
    tokenClient.callback = async(resp) => {
        if (resp.error !== undefined) {
            showNotification('GAuth Error: ' + resp.error);
            throw (resp);
        }
        showNotification('Successfully signed in to Google.');
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken('');
            localStorage.removeItem('codium_gdrive_folder_id');
            gdriveFolderId = null;
            showNotification('Successfully signed out.');
        });
    }
}

async function getOrCreateCodiuMFolderId() {
    if (gdriveFolderId) {
        return gdriveFolderId;
    }
    
    const storedFolderId = localStorage.getItem('codium_gdrive_folder_id');
    if(storedFolderId) {
        gdriveFolderId = storedFolderId;
        return gdriveFolderId;
    }

    try {
        const response = await gapi.client.drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and name='CodiuM' and trashed=false",
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (response.result.files && response.result.files.length > 0) {
            gdriveFolderId = response.result.files[0].id;
            localStorage.setItem('codium_gdrive_folder_id', gdriveFolderId);
            return gdriveFolderId;
        } else {
            const createResponse = await gapi.client.drive.files.create({
                resource: {
                    'name': 'CodiuM',
                    'mimeType': 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            gdriveFolderId = createResponse.result.id;
            localStorage.setItem('codium_gdrive_folder_id', gdriveFolderId);
            showNotification('Created "CodiuM" folder in Google Drive.');
            return gdriveFolderId;
        }
    } catch (err) {
        console.error('Error finding or creating CodiuM folder', err);
        showNotification(`Error accessing Drive folder: ${err.result.error.message}`);
        return null;
    }
}

async function syncProjectToGDrive(projectId) {
    if (!gapi.client.getToken()) {
        showNotification('Please sign in to Google first.');
        handleAuthClick();
        return;
    }

    const folderId = await getOrCreateCodiuMFolderId();
    if (!folderId) {
        showNotification('Could not get or create Google Drive folder. Sync cancelled.');
        return;
    }

    const project = await new Promise((resolve, reject) => {
        const r = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(projectId);
        r.onsuccess = e => resolve(e.target.result);
        r.onerror = e => reject('Error getting project');
    });

    if (!project) {
        showNotification(`Error: Project with ID ${projectId} not found.`);
        return;
    }

    const zip = new JSZip();
    for (const filename in project.files) {
        if (filename.split('/').pop() === '.p') continue;
        const fileData = project.files[filename];
        if (fileData.isBinary) {
            const decompressed = pako.ungzip(fileData.content);
            zip.file(filename, decompressed);
        } else {
            zip.file(filename, fileData.code);
        }
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    const projectName = (project.name || `project-${project.id}`).replace(/[\\/:*?"<>|]/g, '_') + '.zip';
    const metadata = {
        name: projectName,
        mimeType: 'application/zip',
        parents: [folderId]
    };
    
    const form = new FormData();
    const method = project.gdriveFileId ? 'PATCH' : 'POST';
    const path = `/upload/drive/v3/files${project.gdriveFileId ? `/${project.gdriveFileId}` : ''}?uploadType=multipart`;

    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', content);

    try {
        const res = await gapi.client.request({
            path: path,
            method: method,
            params: { 'uploadType': 'multipart' },
            headers: { 'Authorization': `Bearer ${gapi.client.getToken().access_token}` },
            body: form
        });

        project.gdriveFileId = res.result.id;
        project.syncedToGDrive = true;
        await updateCode(project);
        showNotification(`Project "${project.name}" synced successfully.`);
        await loadSavedCodes();

    } catch (err) {
        console.error('GDrive Sync Error:', err);
        showNotification(`Error syncing project: ${err.result.error.message}`);
    }
}

async function syncAllProjectsToGDrive() {
    if (!gapi.client.getToken()) {
        showNotification('Please sign in to Google first.');
        handleAuthClick();
        return;
    }
    
    const folderId = await getOrCreateCodiuMFolderId();
    if (!folderId) {
        showNotification('Could not get or create Google Drive folder. Sync cancelled.');
        return;
    }

    const allProjects = await getCodes();
    showNotification(`Starting to sync ${allProjects.length} projects...`);
    for (const project of allProjects) {
        await syncProjectToGDrive(project.id);
    }
    showNotification('All projects sync finished.');
}