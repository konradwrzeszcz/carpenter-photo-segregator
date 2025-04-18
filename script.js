// --- All JavaScript goes here ---

// --- Constants ---
const CLIENT_ID = '100110295548-0putirgtu0s9tms183trje4cc6ki72ep.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';

// --- DOM Elements ---
const authButton = document.getElementById('auth-button');
const signoutButton = document.getElementById('signout-button');
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const foldersTreeDiv = document.getElementById('folders-tree');
const refreshFoldersButton = document.getElementById('refresh-folders-button');
const newFolderInput = document.getElementById('new-folder-name');
const createFolderButton = document.getElementById('create-folder-button');
const folderSearchInput = document.getElementById('folder-search');
const toastContainer = document.getElementById('toast-container');
const selectedFolderNameDisplay = document.getElementById('selected-folder-name-display');
const captureUploadSection = document.getElementById('capture-upload-section');
const cameraInput = document.getElementById('camera-input');
const galleryInput = document.getElementById('gallery-input');
const takePhotoButton = document.getElementById('take-photo-btn');
const selectGalleryButton = document.getElementById('select-gallery-btn');
const captureControls = document.getElementById('capture-controls');
const previewControls = document.getElementById('preview-controls');
const uploadButton = document.getElementById('upload-button');
const clearSelectionButton = document.getElementById('clear-selection-button');
const fileCountDisplay = document.getElementById('file-count-display');
const thumbnailContainer = document.getElementById('thumbnail-container');

// --- App State ---
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isAttemptingSilentSignIn = false; // Flag to prevent duplicate sign-in flows
let selectedFolderId = null;
let selectedFolderName = null;
let fullFolderList = [];
let selectedFiles = null; // Stores the FileList object from input
let photoSource = null; // Track source: 'camera' or 'gallery'
let activeObjectURLs = []; // Keep track of created Object URLs for cleanup

// --- Initialization ---
function gapiLoaded() {
    console.log("gapiLoaded callback triggered.");
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    console.log("Attempting to initialize gapi client...");
    try {
        await gapi.client.init({
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        console.log("GAPI client initialized successfully.");
        maybeEnableAuthButton();
    } catch (err) {
        console.error("Error initializing GAPI client:", err);
        showToast('Error initializing Google API client.', 'error', 5000);
        gapiInited = false;
        maybeEnableAuthButton();
    }
}

function gisLoaded() {
    console.log("gisLoaded callback triggered.");
    console.log("Attempting to initialize GIS token client...");
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // Defined dynamically
        });
        gisInited = true;
        console.log("GIS token client initialized successfully.");
        maybeEnableAuthButton();
    } catch (err) {
        console.error("Error initializing GIS token client:", err);
        showToast('Error initializing Google Identity Services.', 'error', 5000);
        gisInited = false;
        maybeEnableAuthButton();
    }
}

function maybeEnableAuthButton() {
    console.log(`Checking if auth button can be enabled: gapiInited=${gapiInited}, gisInited=${gisInited}`);
    if (gapiInited && gisInited) {
        authButton.disabled = false;
        console.log("Auth button enabled.");
        // Attempt silent sign-in only if not already done
        if (!isAttemptingSilentSignIn && gapi.client.getToken() === null) {
            attemptSilentSignIn();
        }
    } else {
        authButton.disabled = true;
        console.log("Auth button remains disabled.");
    }
}

// --- Authentication Functions ---
async function handleTokenResponse(resp) {
    isAttemptingSilentSignIn = false; // Reset flag
    if (resp.error !== undefined) {
        // Log error for silent failure, show toast for manual failure
        console.warn('Token request error:', resp.error);
        // Only show toast if it wasn't a silent attempt error (which is expected if user isn't logged in)
        if (resp.error !== 'popup_closed' && resp.error !== 'user_cancel' && resp.error !== 'access_denied' && resp.error !== 'immediate_failed') {
            showToast('Sign-in error: ' + resp.error, 'error', 5000);
        }
        // Do NOT throw error here for silent failures, just don't proceed
        // For manual failures, the user sees the toast.
        return;
    }
    // Successful token acquisition (silent or manual)
    showToast('Sign-in successful!', 'success');
    updateUiSignedIn(true);
    await listFolders();
}

// Function to attempt silent sign-in on page load
function attemptSilentSignIn() {
    if (gapi.client.getToken() !== null) {
        console.log('Already have a token, skipping silent sign-in attempt.');
        return; // Already signed in from this session
    }
    console.log('Attempting silent sign-in...');
    isAttemptingSilentSignIn = true;
    tokenClient.callback = handleTokenResponse; // Use shared handler
    tokenClient.requestAccessToken({ prompt: 'none' });
}

function handleAuthClick() {
    if (gapi.client.getToken() === null) {
        // Manual sign-in attempt
        console.log('Manual sign-in initiated...');
        tokenClient.callback = handleTokenResponse; // Use shared handler
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Already signed in, perhaps clicked button again?
        // Could optionally refresh token or just ignore. Let's ignore for now.
        console.log('Manual sign-in clicked, but already signed in.');
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            gapi.client.setToken(null);
            updateUiSignedIn(false);
            showToast('Signed out.', 'success');
            clearFolderTree();
            selectedFolderId = null;
            selectedFolderName = null;
            captureUploadSection.classList.add('hidden');
            resetPhotoState(); // Reset photo input/preview
        });
    } else {
        showToast('Already signed out.');
    }
}

// --- Drive API Functions ---
async function listFolders() {
    showToast('Loading folders...');
    foldersTreeDiv.innerHTML = '<p>--Loading folders--</p>';
    refreshFoldersButton.disabled = true;
    fullFolderList = [];
    let pageToken = null;
    try {
        do {
            const response = await gapi.client.drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields: 'nextPageToken, files(id, name, parents)',
                pageSize: 500,
                pageToken: pageToken,
                orderBy: 'name'
            });
            if (response.result.files) {
                fullFolderList = fullFolderList.concat(response.result.files);
            }
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        const currentSearchTerm = folderSearchInput.value;
        filterAndRenderTree(currentSearchTerm);

        if (fullFolderList.length === 0) {
            showToast('No folders found.');
        } else {
             if (!currentSearchTerm) {
                 showToast('Folder tree loaded.', 'success');
             }
        }
    } catch (err) {
        showToast('Error loading folders.', 'error', 5000);
        foldersTreeDiv.innerHTML = '<p>--Error loading folders--</p>';
    } finally {
        refreshFoldersButton.disabled = false;
    }
}

function buildTree(folders) {
    const map = {};
    const roots = [];
    folders.forEach(folder => {
        map[folder.id] = { ...folder, children: [] };
    });
    Object.values(map).forEach(node => {
        if (node.parents && node.parents.length > 0) {
            const parentId = node.parents[0];
            if (map[parentId]) {
                if (!map[parentId].children.some(child => child.id === node.id)) {
                    map[parentId].children.push(node);
                }
            } else {
                if (!roots.some(root => root.id === node.id)) {
                    roots.push(node);
                }
            }
        } else {
            if (!roots.some(root => root.id === node.id)) {
                roots.push(node);
            }
        }
    });
    roots.sort((a, b) => a.name.localeCompare(b.name));
    Object.values(map).forEach(node => {
        node.children.sort((a, b) => a.name.localeCompare(b.name));
    });
    return roots;
}

function filterTree(nodes, searchTerm) {
    if (!searchTerm) return nodes;
    const lowerSearchTerm = searchTerm.toLowerCase();
    function recursiveFilter(node, parentMatched) {
        const isDirectMatch = node.name.toLowerCase().includes(lowerSearchTerm);
        const shouldIncludeAllChildren = isDirectMatch || parentMatched;
        let filteredChildren = [];
        let hasMatchingDescendant = false;
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                const result = recursiveFilter(child, shouldIncludeAllChildren);
                if (result) {
                    filteredChildren.push(result);
                    hasMatchingDescendant = true;
                }
            });
        }
        if (isDirectMatch || hasMatchingDescendant || parentMatched) {
            return { ...node, children: filteredChildren };
        } else {
            return null;
        }
    }
    return nodes.map(node => recursiveFilter(node, false)).filter(node => node !== null);
}

function filterAndRenderTree(searchTerm) {
    console.log("Filtering tree with term:", searchTerm);
    const fullTree = buildTree(fullFolderList);
    const filteredTreeNodes = filterTree(fullTree, searchTerm);
    renderTree(filteredTreeNodes, foldersTreeDiv);
    if (selectedFolderId) {
        const selectedLi = foldersTreeDiv.querySelector(`li[data-folder-id="${selectedFolderId}"]`);
        if (selectedLi) {
            const selectedSpan = selectedLi.querySelector('.folder-name');
            if (selectedSpan) {
                selectedSpan.classList.add('selected');
            }
        }
    }
}

function renderTree(nodes, container) {
    container.innerHTML = '';
    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<p>No matching folders found.</p>';
        return;
    }
    const ul = document.createElement('ul');
    nodes.forEach(node => {
        const li = document.createElement('li');
        li.dataset.folderId = node.id;
        const span = document.createElement('span');
        span.className = 'folder-name';
        span.textContent = node.name;
        li.appendChild(span);
        li.addEventListener('click', handleFolderSelect);
        if (node.children && node.children.length > 0) {
            const childUl = document.createElement('ul');
            renderTree(node.children, childUl);
            li.appendChild(childUl);
        }
        ul.appendChild(li);
    });
    container.appendChild(ul);
}

async function createFolder() {
    const folderName = newFolderInput.value.trim();
    if (!folderName) {
        showToast('Please enter a folder name.', 'error');
        return;
    }
    showToast(`Creating folder "${folderName}"...`);
    createFolderButton.disabled = true;
    newFolderInput.disabled = true;
    try {
        if (!selectedFolderId) {
            showToast('Please select a parent folder first.', 'error');
            throw new Error('Parent folder not selected');
        }
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [selectedFolderId]
        };
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id, name'
        });
        showToast(`Folder "${response.result.name}" created.`, 'success');
        newFolderInput.value = '';
        await listFolders();
    } catch (err) {
        if (err.message !== 'Parent folder not selected') {
            showToast('Error creating folder.', 'error');
            console.error('Error creating folder:', err);
        }
    } finally {
        createFolderButton.disabled = false;
        newFolderInput.disabled = false;
    }
}

function handleFolderSelect(event) {
    event.stopPropagation();
    let targetLi = event.target;
    while (targetLi && targetLi.tagName !== 'LI') {
        targetLi = targetLi.parentElement;
    }
    if (!targetLi || !targetLi.dataset.folderId) return;

    const newFolderId = targetLi.dataset.folderId;
    const newFolderName = targetLi.querySelector('.folder-name').textContent;

    // Check if the selection is actually changing
    const isNewSelection = newFolderId !== selectedFolderId;

    // Update highlighting regardless of whether the folder changed
    const currentlySelectedSpan = foldersTreeDiv.querySelector('.folder-name.selected');
    if (currentlySelectedSpan) {
        currentlySelectedSpan.classList.remove('selected');
    }
    const targetSpan = targetLi.querySelector('.folder-name');
    if (targetSpan) {
        targetSpan.classList.add('selected');
    }

    // Update state and UI only if it is a new selection
    if (isNewSelection) {
        selectedFolderId = newFolderId;
        selectedFolderName = newFolderName;
        selectedFolderNameDisplay.textContent = newFolderName;
        captureUploadSection.classList.remove('hidden');
        resetPhotoState(); // Reset photo state ONLY when folder selection changes
    } else {
        // Ensure capture section is visible even if same folder is re-clicked
        captureUploadSection.classList.remove('hidden');
    }
}

function clearFolderTree() {
    foldersTreeDiv.innerHTML = '<p>--Select a folder--</p>';
}

// --- Photo Input/Preview Functions ---
function handleTakePhotoClick(event) {
    event.stopPropagation();
    cameraInput.click();
}

function handleSelectGalleryClick(event) {
    event.stopPropagation();
    galleryInput.click();
}

function handleFileInputChange(event) {
    try {
        photoSource = event.target.id === 'camera-input' ? 'camera' : 'gallery'; // Set photo source
        console.log('[handleFileInputChange] Photo source:', photoSource); // Optional: Keep for testing

        if (event.target.files && event.target.files.length > 0) {
            const filesFromInput = event.target.files;
            const filesArray = [];
            for (let i = 0; i < filesFromInput.length; i++) {
                filesArray.push(filesFromInput[i]);
            }
            selectedFiles = filesArray;
            event.target.value = null;
            thumbnailContainer.innerHTML = '';
            revokeActiveObjectURLs();
            for (const file of selectedFiles) {
                const img = document.createElement('img');
                const objectURL = URL.createObjectURL(file);
                img.src = objectURL;
                img.className = 'thumbnail-img';
                img.alt = file.name;
                thumbnailContainer.appendChild(img);
                activeObjectURLs.push(objectURL);
            }
            fileCountDisplay.textContent = selectedFiles.length;
            captureControls.classList.add('hidden');
            previewControls.classList.remove('hidden');
            showToast(`${selectedFiles.length} photo(s) ready for upload.`, 'info');
        } else {
            selectedFiles = null;
            fileCountDisplay.textContent = 0;
        }
    } catch (error) {
        showToast('Error processing selected photos.', 'error');
        resetPhotoState();
    }
}

function handleClearSelectionClick(event) {
    event.stopPropagation();
    resetPhotoState();
    showToast('Selection cleared. Ready to select new photos.');
}

function resetPhotoState() {
    selectedFiles = null;
    photoSource = null; // Reset photo source
    cameraInput.value = null;
    galleryInput.value = null;
    thumbnailContainer.innerHTML = '';
    revokeActiveObjectURLs();
    fileCountDisplay.textContent = 0;
    captureControls.classList.remove('hidden');
    previewControls.classList.add('hidden');
    uploadButton.disabled = false;
    clearSelectionButton.disabled = false;
}

// Helper function to revoke object URLs
function revokeActiveObjectURLs() {
    activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
    activeObjectURLs = [];
}

// --- Upload Function (Modified for multiple files) ---
async function handleUploadClick(event) {
    event.stopPropagation();
    if (!selectedFiles || selectedFiles.length === 0) {
        showToast('No photo selected yet.', 'error');
        return;
    }
    if (!selectedFolderId) {
        showToast('No folder selected for upload.', 'error');
        return;
    }

    const totalFiles = selectedFiles.length;
    const progressToastId = 'upload-progress-toast';

    // Check if we should attempt download first
    let attemptDownload = (photoSource === 'camera' && totalFiles === 1);
    let initialToastMsg = attemptDownload 
        ? 'Saving to device & starting upload...' 
        : `Uploading 0/${totalFiles} photo(s)...`;

    showToast(initialToastMsg, 'info', 0, progressToastId); // Show initial non-expiring toast
    uploadButton.disabled = true;
    clearSelectionButton.disabled = true;

    // Perform download if needed
    if (attemptDownload) {
        try {
            console.log('Attempting to save camera photo to device...');
            const fileToSave = selectedFiles[0];
            const link = document.createElement('a');
            const filename = fileToSave.name || `photo_${new Date().toISOString().replace(/:/g, '_').replace(/\.\d{3}Z$/, 'Z')}.jpg`;
            const url = URL.createObjectURL(fileToSave);
            try {
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log('Save to device triggered.');
            } finally {
                URL.revokeObjectURL(url); 
            }
        } catch(err) {
            console.error('Error saving camera photo to device:', err);
            showToast('Could not save photo to device.', 'error', 3000); // Show separate error, but continue upload
            attemptDownload = false; // Ensure final toast doesn't mention failed save attempt misleadingly if upload succeeds
        }
    }

    // Proceed with Upload logic
    let successCount = 0;
    let errorCount = 0;
    const uploadPromises = [];

    const updateProgressToast = () => {
        const completedCount = successCount + errorCount;
        const message = `Uploading... (${completedCount}/${totalFiles} completed${errorCount > 0 ? ', ' + errorCount + ' failed' : ''})`;
        showToast(message, 'info', 0, progressToastId);
    };

    const accessToken = gapi.client.getToken()?.access_token;
    if (!accessToken) {
        showToast('Authentication error. Please sign in again.', 'error');
        uploadButton.disabled = false;
        clearSelectionButton.disabled = false;
        return;
    }

    for (const file of selectedFiles) {
        uploadPromises.push(
            uploadSingleFile(file, selectedFolderId, accessToken)
                .then(result => {
                    successCount++;
                    updateProgressToast();
                    return result;
                })
                .catch(error => {
                    errorCount++;
                    updateProgressToast();
                    console.error('Individual upload failed:', error);
                    throw error;
                })
        );
    }

    try {
        await Promise.all(uploadPromises);
    } catch (overallError) {
        console.log("One or more uploads failed.");
    }

    showToast('Upload process finished.', 'info', 1000, progressToastId);
    if (errorCount === 0 && successCount === totalFiles) {
        showToast(`All ${successCount} photo(s) uploaded successfully!` + (attemptDownload ? ' (Save attempted)' : ''), 'success', 5000);
        resetPhotoState();
    } else {
        showToast(`${successCount}/${totalFiles} succeeded, ${errorCount} failed. Check console.` + (attemptDownload ? ' (Save attempted)' : ''), 'error', 7000);
        uploadButton.disabled = false;
        clearSelectionButton.disabled = false;
    }

    revokeActiveObjectURLs();
}

async function uploadSingleFile(file, parentFolderId, accessToken) {
    console.log(`Uploading file: ${file.name} to folder: ${parentFolderId}`);
    try {
        const filename = file.name || `photo_${new Date().toISOString().replace(/:/g, '_').replace(/\.\d{3}Z$/, 'Z')}.jpg`;
        const metadata = {
            name: filename,
            mimeType: file.type || 'image/jpeg',
            parents: [parentFolderId]
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const fetchResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: form
        });
        const responseJson = await fetchResponse.json();
        if (!fetchResponse.ok) {
            throw new Error(`Upload failed: ${fetchResponse.status} ${fetchResponse.statusText} - ${JSON.stringify(responseJson)}`);
        }
        console.log('Upload successful! API Response:', responseJson);
        return responseJson;
    } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        throw err;
    }
}

// --- UI Update Functions ---
function updateUiSignedIn(isSignedIn) {
    if (isSignedIn) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        clearFolderTree();
        selectedFolderId = null;
        selectedFolderName = null;
        captureUploadSection.classList.add('hidden');
        resetPhotoState();
    }
}

function showToast(message, type = 'info', duration = 3000, toastId = null) {
    let toast = toastId ? document.getElementById(toastId) : null;
    console.log(`Toast (${type}):`, message);

    if (toast) {
        toast.textContent = message;
        toast.className = `toast-message ${type} show`;
    } else {
        toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        if (toastId) toast.id = toastId;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
    }

    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
        toast.removeAttribute('data-timeout-id');
    }

    if (duration > 0) {
        const timeoutId = setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            });
        }, duration);
        toast.dataset.timeoutId = timeoutId.toString();
    }
}

// --- Event Listeners ---
authButton.addEventListener('click', handleAuthClick);
signoutButton.addEventListener('click', handleSignoutClick);
refreshFoldersButton.addEventListener('click', listFolders);
createFolderButton.addEventListener('click', createFolder);
takePhotoButton.addEventListener('click', handleTakePhotoClick);
selectGalleryButton.addEventListener('click', handleSelectGalleryClick);
cameraInput.addEventListener('change', handleFileInputChange);
galleryInput.addEventListener('change', handleFileInputChange);
clearSelectionButton.addEventListener('click', handleClearSelectionClick);
uploadButton.addEventListener('click', handleUploadClick);
folderSearchInput.addEventListener('input', (e) => filterAndRenderTree(e.target.value));

authButton.disabled = true; 