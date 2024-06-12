const vscode = require('vscode');
const https = require('https');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanExtensions(context) {
    vscode.window.showInformationMessage(`📡 ExtensionTotal: Running scan...`, {
        detail: `ExtensionTotal scans your environment regularly for high risk extensions.`,
    });
    for (let extension of vscode.extensions.all) {
        if (extension.id.startsWith('vscode.')) {
            continue;
        }

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
                },
                body: body,
            },
            function (res) {
                if (res.statusCode === 429) {
                    vscode.window.showInformationMessage(
                        `📡 ExtensionTotal: Free rate limit reached, email to us for an API key`
                    );
                    return;
                }

                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    try {
                        const extensionData = JSON.parse(body);
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

        await sleep(5000);
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    await scanExtensions(context);

    vscode.extensions.onDidChange(async (event) => {
        await scanExtensions(context);
    });
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate,
};
