import vscode from 'vscode';
import https from 'https';
import _ from 'lodash';
import APIKeyManager from './apiKeyManager';

function getNonce() {
    let text = '';
    const possible =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

class ExtensionResultProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    context
    results

    constructor(context) {
        this.context = context;
        let savedResults = JSON.parse(
            this.context.globalState.get(`extensiontotal-scan-results`, '[]')
        );
        this.results = {};
        for (let result of savedResults) {
            this.results[result.extensionName] = new ScanResult(
                result.extensionId,
                result.extensionName,
                result.riskLabel,
                result.risk,
                vscode.TreeItemCollapsibleState.None
            );
        }
    }

    refresh(resetResults = false) {
        if (resetResults) {
            this.results = {};
            this.context.globalState.update(`extensiontotal-scan-results`, undefined);
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    addResult(extensionId, extensionName, riskLabel, risk) {
        this.results[extensionName] = new ScanResult(
            extensionId,
            extensionName,
            riskLabel,
            risk,
            vscode.TreeItemCollapsibleState.None
        );
        this.context.globalState.update(
            `extensiontotal-scan-results`,
            JSON.stringify([
                ...JSON.parse(
                    this.context.globalState.get(
                        `extensiontotal-scan-results`,
                        '[]'
                    )
                ),
                { extensionId, extensionName, riskLabel, risk },
            ])
        );
    }

    getChildren(element) {
        if (Object.keys(this.results).length === 0) {
            return Promise.resolve([]);
        }

        return Promise.resolve(
            _.orderBy(Object.values(this.results), 'risk', 'desc')
        );
    }
}

class WelcomeViewProvider {
    viewType = 'extensiontotal-welcome';
    _context;
    _extensionUri
    _apiKeyManager
    _view;

    constructor(_context, _apiKeyManager) {
        this._context = _context;
        this._extensionUri = _context.extensionUri;
        this._apiKeyManager = _apiKeyManager;
    }

    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'apiKeySet': {
                    await this._apiKeyManager.setApiKey(data.value);
                    break;
                }
            }
        });
    }

    _getHtmlForWebview(webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );

        // Do the same for the stylesheet.
        const styleResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css')
        );
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css')
        );
        const styleMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
        );
        const logoUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'icon-white.svg')
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';  img-src ${webview.cspSource} data:;">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>ExtensionTotal</title>
			</head>
			<body>
                <br/>
                <br/>
                <h2 style="display: flex; align-items: center; justify-content: center"><img width="22px" height="22px" src="${logoUri}" />&nbsp;ExtensionTotal</h2>
                <p>Welcome to ExtensionTotal, a free community tool to assess the risk of Visual Studio Code extensions. To begin enter your API key below.</p>
                <br/>
				<input class="api-key-input" placeholder="API Key..." type="password"></input>
                <button class="add-api-key-button">Set API Key</button>
                <br/>
                <a href="https://app.extensiontotal.com/profile" style="color: #6567f0">Don't have an API key yet? get a free one here</a>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

class ScanResult extends vscode.TreeItem {
    constructor(extensionId, extensionName, riskLabel, risk, collapsibleState) {
        super(extensionName, collapsibleState);
        this.riskLabel = riskLabel;
        this.extensionId = extensionId;
        this.risk = risk;
        this.extensionName = extensionName;
    }

    get tooltip() {
        return `${this.extensionName} with ${this.riskLabel} risk`;
    }

    get description() {
        return `${this.riskLabel} Risk (${this.risk.toFixed(2)})`;
    }

    contextValue = 'scan-result';
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanExtensions(context, apiKey, config, isManualScan = false) {
    const { scanOnlyNewVersion, scanInterval, provider } = config;

    if (!apiKey) {
        return;
    }

    let lastScan = context.globalState.get(`last-extensiontotal-scan`, null);
    if (
        scanInterval !== 0 &&
        lastScan &&
        lastScan < new Date().getTime() - scanInterval * 60 * 60 * 1000 &&
        !isManualScan
    ) {
        return;
    }

    context.globalState.update(
        `last-extensiontotal-scan`,
        new Date().getTime()
    );

    const extensions = vscode.extensions.all.filter(
        (extension) => !extension.id.startsWith('vscode.')
    );

    let foundHigh = false;
    let limitReached = false;
    let invalidApiKey = false;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `📡 ExtensionTotal: Running scan on ${extensions.length} extensions...`,
            cancellable: true,
        },
        async (progress, token) => {
            provider.refresh(true);
            let forceStop = false;
            token.onCancellationRequested(() => {
                forceStop = true;
            });
            const incrementBy = 100 / extensions.length;
            for (
                let index = 0;
                index < extensions.length && !forceStop && !invalidApiKey;
                index++
            ) {
                const extension = extensions[index];
                if (scanOnlyNewVersion) {
                    let lastVersion = context.globalState.get(
                        `scanned-${extension.id}`,
                        null
                    );
                    if (lastVersion === extension.version) {
                        continue;
                    }
                }

                progress.report({ increment: incrementBy });

                const body = JSON.stringify({
                    q: extension.id,
                });

                await new Promise<void>((resolve, _) => {
                    var post_req = https.request(
                        {
                            host: 'app.extensiontotal.com',
                            port: '443',
                            path: '/api/getExtensionRisk',
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Origin': 'Extension',
                                ...(apiKey ? { 'X-API-Key': apiKey } : {}),
                            },
                        },
                        function (res) {
                            if (res.statusCode === 429) {
                                limitReached = true;
                                vscode.window.showInformationMessage(
                                    `📡 ExtensionTotal: Free rate limit reached, visit https://app.extensiontotal.com/sponsor for an API key`
                                );
                                resolve();
                                return;
                            } else if (res.statusCode === 403) {
                                invalidApiKey = true;  // invalid API key
                                resolve();
                                return;
                            }

                            let body = '';

                            res.on('data', (chunk) => {
                                body += chunk;
                            });

                            res.on('end', () => {
                                try {
                                    if (body === 'Invalid API key') {
                                        invalidApiKey = true;  // invalid API key
                                        resolve();
                                        return;
                                    }
                                    const extensionData = JSON.parse(body);
                                    context.globalState.update(
                                        `scanned-${extension.id}`,
                                        extension.version
                                    );
                                    provider.addResult(
                                        extension.id,
                                        extensionData.display_name,
                                        extensionData.riskLabel,
                                        extensionData.risk
                                    );
                                    provider.refresh();

                                    if (extensionData.risk >= 7) {
                                        let lastTagged = context.globalState.get(
                                            `alerted-${extension.id}`,
                                            'no'
                                        );
                                        if (lastTagged === 'yes') {
                                            resolve();
                                            return;
                                        }

                                        foundHigh = true;
                                        vscode.window.showInformationMessage(
                                            `🚨 High Risk Extension Found: ${extensionData.display_name}`,
                                            {
                                                modal: true,
                                                detail: `ExtensionTotal found a new high risk extension "${
                                                    extensionData.display_name ||
                                                    extensionData.name
                                                }" installed on your machine.\n\n
                                            Consider reviewing the ExtensionTotal report: https://app.extensiontotal/report/${
                                                extension.id
                                            }\n\n
                                            Once confirming this message, we will no longer alert you on this extension.`,
                                            }
                                        );
                                        context.globalState.update(
                                            `alerted-${extension.id}`,
                                            'yes'
                                        );
                                    }
                                    resolve();
                                } catch (error) {
                                    console.error(error.message);
                                    resolve();
                                }
                            });
                        }
                    );

                    post_req.write(body);
                    post_req.end();

                    post_req.on('error', (e) => {
                        vscode.window.showErrorMessage(
                            `📡 ExtensionTotal: ${e.toString()}`
                        );
                        resolve();
                    });
                });

                if (limitReached || invalidApiKey) {
                    break;
                }

                await sleep(1500);
            }
        }
    );

    if (invalidApiKey) {
        vscode.window.showErrorMessage(
            `📡 ExtensionTotal: Scan aborted due to invalid API key. Please re-enter your API key in the ExtensionTotal panel.`
        );
    } else if (foundHigh) {
        vscode.window.showInformationMessage(`📡 ExtensionTotal: Finished scan with high risk findings 🚨 Please review results in the ExtensionTotal pane.`);
    } else {
        vscode.window.showInformationMessage(`📡 ExtensionTotal: Finished scan with no high risk findings. Review results in the ExtensionTotal pane.`);
    }
}

function reloadAccordingToConfig(context, providers) {
    const { provider, welcomeProvider } = providers;

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'extensiontotal-welcome',
            welcomeProvider
        )
    );

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(
            'extensiontotal-results',
            provider
        )
    );

    const options = {
        treeDataProvider: provider
    };

    const tree = vscode.window.createTreeView('extensiontotal-results', options);
    tree.onDidChangeSelection(e => {
        const selected = e.selection[0];
        vscode.env.openExternal(vscode.Uri.parse(`https://app.extensiontotal.com/report/${selected.extensionId}`));
    });
}

async function transitionApiKey(apiKeyManager) {
    if (apiKeyManager.getApiKey()) {
        console.log('api key found')
        return
    }
    const config = vscode.workspace.getConfiguration('extensiontotal');
    const target = vscode.ConfigurationTarget.Global;
    const apiKey = config.get('apiKeySetting');
    console.log(`found old apiKey ${apiKey}`)
    if (apiKey) {
        await apiKeyManager.setApiKey(apiKey)
    }
    await config.update(
        'apiKeySetting',
        '',
        target
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const apiKeyManager = new APIKeyManager(context);
    await apiKeyManager.initialize();

    const provider = new ExtensionResultProvider(context);
    const welcomeProvider = new WelcomeViewProvider(context, apiKeyManager);

    await transitionApiKey(apiKeyManager)

    if (!apiKeyManager.getApiKey()) {
        vscode.window.showInformationMessage(
            `📡 ExtensionTotal: No API key found, Please set your API key in the ExtensionTotal panel.`
        );
    }

    const scanHandler = async (isManualScan = false) => {
        const config = vscode.workspace.getConfiguration('extensiontotal');
        const scanOnlyNewVersion = config.get('scanOnlyNewVersions');
        const scanInterval = config.get('scanEveryXHours');
        const currentApiKey = apiKeyManager.getApiKey();

        await scanExtensions(
            context,
            currentApiKey,
            {
                scanOnlyNewVersion,
                scanInterval,
                provider,
            },
            isManualScan
        );
    };

    reloadAccordingToConfig(context, { provider, welcomeProvider });

    vscode.workspace.onDidChangeConfiguration(() => {
        reloadAccordingToConfig(context, { provider, welcomeProvider });
    });

    vscode.extensions.onDidChange(async (event) => {
        await scanHandler(false);
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('ExtensionTotal.scan', () => scanHandler(true))
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ExtensionTotal.setApiKey', async () => {
            const newApiKey = await vscode.window.showInputBox({
                prompt: "Enter your ExtensionTotal API Key",
                password: true
            });
            if (newApiKey) {
                await apiKeyManager.setApiKey(newApiKey);
            }
        })
    )

    const config = vscode.workspace.getConfiguration('extensiontotal');
    const scanOnStartup = config.get('scanOnStartup');
        
    if (scanOnStartup) {
        scanHandler(false);
    }
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
};
