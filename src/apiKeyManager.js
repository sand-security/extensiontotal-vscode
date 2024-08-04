const vscode = require('vscode');

class APIKeyManager {
    SECRET_NAME = 'extensiontotal.apiKey';
    constructor(context) {
        this._context = context;
        this._currentApiKey = null;
    }

    async initialize() {
        this._currentApiKey = await this._context.secrets.get(this.SECRET_NAME);
    }

    async setApiKey(newApiKey) {
        if (!newApiKey) {
            vscode.window.showWarningMessage(
                `📡 ExtensionTotal: No API key found. Please set your API key in the ExtensionTotal panel.`
            );
            return;
        }
        await this._context.secrets.store(this.SECRET_NAME, newApiKey);
        this._currentApiKey = newApiKey;
        vscode.window.showInformationMessage('📡 ExtensionTotal: API key has been set successfully.');
    }

    async getApiKey() {
        return this._currentApiKey;
    }
}

module.exports = APIKeyManager;
