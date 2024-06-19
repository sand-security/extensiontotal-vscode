//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    document.querySelector('.add-api-key-button').addEventListener('click', () => {
        setApiKey();
    });


    function setApiKey() {
        vscode.postMessage({ type: 'apiKeySet', value: document.querySelector('.api-key-input')?.value });
    }
}());

