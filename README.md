# Carpenter Photo Segregator

A simple, single-page web application that allows users to:
*   Sign in with their Google Account.
*   View folders from the root of their Google Drive.
*   Create new folders in the root of their Google Drive.
*   Select a folder.
*   Access their device camera.
*   Capture a photo.
*   Upload the captured photo directly to the selected Google Drive folder.

The entire application runs in the browser using HTML and JavaScript, requiring no backend server.

## Prerequisites

*   A Google Account.
*   A modern web browser that supports the `navigator.mediaDevices` API (for camera access) and Google Sign-In (e.g., Chrome, Firefox, Edge, Safari).
*   A configured Google Cloud Project with OAuth 2.0 Credentials.

## Setup Instructions

1.  **Google Cloud Console Setup:**
    *   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    *   Create a new project or select an existing one.
    *   **Enable APIs:** Go to "APIs & Services" > "Library" and enable the **Google Drive API**. You might also need the **Google People API** if you encounter issues with user info fetching (though `gapi.client.oauth2.userinfo.get()` usually works without it).
    *   **Configure OAuth Consent Screen:** Go to "APIs & Services" > "OAuth consent screen".
        *   Choose "External" user type (unless you are a Google Workspace user and want internal only).
        *   Fill in the required app information (App name, User support email, Developer contact information). You can leave most fields blank for testing.
        *   **Scopes:** Click "Add or Remove Scopes" and add the `.../auth/drive.file` scope (`https://www.googleapis.com/auth/drive.file`). This allows the app to view/manage files/folders it creates or is opened with, and create new ones.
        *   **Test Users:** Add your Google Account email address to the list of test users while the app is in "Testing" mode.
    *   **Create Credentials:** Go to "APIs & Services" > "Credentials".
        *   Click "+ CREATE CREDENTIALS" > "OAuth client ID".
        *   Select "Web application" as the Application type.
        *   Give it a name (e.g., "Drive Photo App Frontend").
        *   **Authorized JavaScript origins:** Add the origins from where you will be serving the `index.html` file. For local testing, add:
            *   `http://localhost`
            *   `http://localhost:<port>` (if you use a local server like `python -m http.server`, add the specific port, e.g., `http://localhost:8000`)
            *   `http://127.0.0.1`
            *   `http://127.0.0.1:<port>`
        *   **Authorized redirect URIs:** Usually not strictly needed for this JavaScript-only flow, but adding the same origins won't hurt.
        *   Click "Create".
    *   **Copy Client ID:** After creation, a pop-up will show your "Client ID". Copy this value.

2.  **Edit `index.html`:**
    *   Open the `index.html` file in a text editor.
    *   Find the line containing `const CLIENT_ID = 'YOUR_CLIENT_ID';` (around line 73).
    *   Replace the placeholder `'YOUR_CLIENT_ID'` with the actual Client ID you copied from the Google Cloud Console.
    *   *(Optional)* You might see a `YOUR_API_KEY` placeholder. For this application using OAuth 2.0 and discovery documents, an API Key is usually *not* required. You can likely leave it as is or remove the constant and its usage in `gapi.client.init` if you encounter issues.
    *   Save the `index.html` file.

## Running the Application

Since this is a purely frontend application, you just need to open the `index.html` file in your web browser.

*   **Directly:** Double-click the `index.html` file. (Note: Some browser security features might restrict API access when opened directly from the filesystem (`file:///...`). Using a local server is recommended.)
*   **Using a Local Server (Recommended):**
    *   Open a terminal or command prompt in the project directory (where `index.html` is located).
    *   Run a simple web server. If you have Python 3 installed:
        ```bash
        python -m http.server
        ```
        (Or `python -m SimpleHTTPServer` for Python 2)
    *   Open your web browser and navigate to `http://localhost:8000` (or the port specified by the server).

## How to Use

1.  **Sign In:** Click the "Sign in with Google" button and follow the prompts to log in with your Google Account and grant the requested permissions (for Google Drive).
2.  **Select Folder:** Once signed in, a dropdown list will show folders from the root of your Google Drive. Select the folder where you want to save the photo.
3.  **Create Folder (Optional):** If needed, type a name in the "New folder name" input field and click "Create Folder" to add a new folder to your Drive root. The list will refresh automatically. Select the newly created folder.
4.  **Grant Camera Permission:** Once a folder is selected, the app will request permission to use your device's camera. Grant permission when prompted by the browser.
5.  **Capture Photo:** The camera feed will appear. Point the camera and click "Capture Photo".
6.  **Review & Upload:** A preview of the captured photo will be shown.
    *   If you're happy with it, click "Upload Photo". The photo will be uploaded to the selected Google Drive folder with a name like `photo_<timestamp>.jpg`.
    *   If you want to try again, click "Retake Photo". The camera feed will restart.
7.  **Sign Out:** Click the "Sign Out" button when you are finished.

## Notes & Limitations

*   This application interacts directly with Google APIs from the browser. Your Google Drive access token is handled by the Google libraries in the frontend.
*   Only folders directly in the "My Drive" root are listed and created. Subfolder navigation/creation is not implemented.
*   Error handling is basic; check the browser's developer console (F12) for detailed error messages if something goes wrong.
*   Styling is minimal. 