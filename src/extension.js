const vscode = require('vscode');
const https = require('https');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanExtensions(context, apiKey, config, isManualScan = false) {
    const {
        scanOnlyNewVersion,
        scanInterval
    } = config;

    let lastScan = context.globalState.get(
        `last-extensiontotal-scan`,
        null
    );
    if (lastScan && lastScan < (new Date().getTime() - 3 * 60 * 60 * 1000) && !isManualScan) {
        return;
    }

    context.globalState.update(
        `last-extensiontotal-scan`,
        new Date().getTime()
    );

    const extensions = vscode.extensions.all.filter(
        (extension) => !extension.id.startsWith('vscode.')
    );
    
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `📡 ExtensionTotal: Running scan on ${extensions.length} extensions...`,
            cancellable: true,
        },
        async (progress, token) => {
            let forceStop = false;
            token.onCancellationRequested(() => {
                forceStop = true;
            });
            const incrementBy = 100 / extensions.length;
            for (
                let index = 0;
                index < extensions.length && !forceStop;
                index++
            ) {
                const extension = vscode.extensions.all[index];
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

                // Send data
                var post_req = https.request(
                    {
                        host: 'app.extensiontotal.com',
                        port: '443',
                        path: '/api/getExtensionRisk',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
                        },
                        body: body,
                    },
                    function (res) {
                        if (res.statusCode === 429) {
                            vscode.window.showInformationMessage(
                                `📡 ExtensionTotal: Free rate limit reached, email to us at amit@extensiontotal.com for an API key`
                            );
                            return;
                        } else if (res.statusCode === 403) {
                            vscode.window.showErrorMessage(
                                `📡 ExtensionTotal: Invalid API Key..`
                            );
                        }

                        let body = '';

                        res.on('data', (chunk) => {
                            body += chunk;
                        });

                        res.on('end', () => {
                            try {
                                if (body === 'Invalid API key') {
                                    vscode.window.showErrorMessage(
                                        `📡 ExtensionTotal: Invalid API Key..`
                                    );
                                    return;
                                }
                                const extensionData = JSON.parse(body);
                                context.globalState.update(
                                    `scanned-${extension.id}`,
                                    extension.version
                                );

                                if (extensionData.risk >= 7) {
                                    let lastTagged = context.globalState.get(
                                        `alerted-${extension.id}`,
                                        'no'
                                    );
                                    if (lastTagged === 'yes') {
                                        return;
                                    }

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
                            } catch (error) {
                                console.error(error.message);
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
                });

                await sleep(1500);
            }
        }
    );

    vscode.window.showInformationMessage(
        `📡 ExtensionTotal: Finished scan.`
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const config = vscode.workspace.getConfiguration('extensiontotal');
    const apiKey = config.get('apiKeySetting');
    const scanOnlyNewVersion = config.get('scanOnlyNewVersions');
    const scanInterval = config.get('scanEveryXHours');

    if (apiKey) {
        vscode.window.showInformationMessage(
            `📡 ExtensionTotal: Detected API Key...`
        );
    }

    await scanExtensions(context, apiKey, {
        scanOnlyNewVersion,
        scanInterval
    }, false);

    vscode.extensions.onDidChange(async (event) => {
        await scanExtensions(context, apiKey, {
            scanOnlyNewVersion,
            scanInterval
        }, false);
    });

    const scanHandler = async () => {
        await scanExtensions(context, apiKey, {
            scanOnlyNewVersion,
            scanInterval
        }, true);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('ExtensionTotal.scan', scanHandler)
    );
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
};
