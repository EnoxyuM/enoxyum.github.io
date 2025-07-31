const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest", "https://www.googleapis.com/discovery/v1/apis/picker/v1/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let pickerApiLoaded = false;
let gdriveFolderId = localStorage.getItem('gdrive_folder_id');

function gapiLoaded() {
    gapi.load('client:picker', initializeGapiClient);
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
        callback: '', // определяется динамически
    });
    gisInited = true;
    checkInitStatus();
}

function checkInitStatus() {
    if (gapiInited && gisInited) {
        const gdriveAuthBtn = document.getElementById('gdriveAuthBtn');
        if (gdriveAuthBtn) {
            gdriveAuthBtn.disabled = false;
        }
    }
}

function handleAuthClick() {
    tokenClient.callback = async(resp) => {
        if (resp.error !== undefined) {
            showNotification('GAuth Error: ' + resp.error);
            throw (resp);
        }
        document.getElementById('gdriveAuthBtn').textContent = 'Sign Out';
        document.getElementById('gdriveAuthBtn').onclick = handleSignoutClick;
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
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem('gdrive_folder_id');
        gdriveFolderId = null;
        document.getElementById('gdriveAuthBtn').textContent = 'Sign in to GDrive';
        document.getElementById('gdriveAuthBtn').onclick = handleAuthClick;
        showNotification('Successfully signed out.');
    }
}

async function selectGDriveFolder() {
    return new Promise((resolve, reject) => {
        const view = new google.picker.View(google.picker.ViewId.FOLDERS)
            .setMimeTypes('application/vnd.google-apps.folder');

        const picker = new google.picker.PickerBuilder()
            .setAppId(CLIENT_ID.split('-')[0])
            .setOAuthToken(gapi.client.getToken().access_token)
            .addView(view)
            .setDeveloperKey(API_KEY)
            .setCallback(data => {
                if (data.action === google.picker.Action.PICKED) {
                    const folder = data.docs[0];
                    gdriveFolderId = folder.id;
                    localStorage.setItem('gdrive_folder_id', gdriveFolderId);
                    showNotification(`Selected folder: ${folder.name}`);
                    resolve(gdriveFolderId);
                } else if (data.action === google.picker.Action.CANCEL) {
                    reject('Picker was cancelled');
                }
            })
            .build();
        picker.setVisible(true);
    });
}

async function syncProjectToGDrive(projectId) {
    if (!gapi.client.getToken()) {
        showNotification('Please sign in to Google first.');
        handleAuthClick();
        return;
    }
    if (!gdriveFolderId) {
        showNotification('Please select a Google Drive folder to sync to.');
        try {
            await selectGDriveFolder();
        } catch (error) {
            showNotification('Sync cancelled: Folder selection is required.');
            return;
        }
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
        parents: [gdriveFolderId]
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
     if (!gdriveFolderId) {
        showNotification('Please select a root folder first.');
        try {
            await selectGDriveFolder();
        } catch (error) {
            showNotification('Sync cancelled: Folder selection is required.');
            return;
        }
    }

    const allProjects = await getCodes();
    showNotification(`Starting to sync ${allProjects.length} projects...`);
    for (const project of allProjects) {
        await syncProjectToGDrive(project.id);
    }
    showNotification('All projects sync finished.');
}
