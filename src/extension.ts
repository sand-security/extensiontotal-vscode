import https from "https";
import _ from "lodash";
import vscode from "vscode";
import APIKeyManager from "./apiKeyManager";
import { sleep } from "./utils";
import { ExtensionResultProvider } from "./ExtensionResultProvider";
import { WelcomeViewProvider } from "./WelcomeViewProvider";

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

  context.globalState.update(`last-extensiontotal-scan`, new Date().getTime());

  const extensions = vscode.extensions.all.filter(
    (extension) => !extension.id.startsWith("vscode.")
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
          if (lastVersion === extension.packageJSON.version) {
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
              host: "app.extensiontotal.com",
              port: "443",
              path: "/api/getExtensionRisk",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Origin": "Extension",
                ...(apiKey ? { "X-API-Key": apiKey } : {}),
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
                invalidApiKey = true; // invalid API key
                resolve();
                return;
              }

              let body = "";

              res.on("data", (chunk) => {
                body += chunk;
              });

              res.on("end", () => {
                try {
                  if (body === "Invalid API key") {
                    invalidApiKey = true; // invalid API key
                    resolve();
                    return;
                  }
                  const extensionData = JSON.parse(body);
                  context.globalState.update(
                    `scanned-${extension.id}`,
                    extension.packageJSON.version
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
                      "no"
                    );
                    if (lastTagged === "yes") {
                      resolve();
                      return;
                    }

                    foundHigh = true;
                    vscode.window.showInformationMessage(
                      `🚨 High Risk Extension Found: ${extensionData.display_name}`,
                      {
                        modal: true,
                        detail: `ExtensionTotal found a new high risk extension "${
                          extensionData.display_name || extensionData.name
                        }" installed on your machine.\n\n
                                            Consider reviewing the ExtensionTotal report: https://app.extensiontotal/report/${
                                              extension.id
                                            }\n\n
                                            Once confirming this message, we will no longer alert you on this extension.`,
                      }
                    );
                    context.globalState.update(
                      `alerted-${extension.id}`,
                      "yes"
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

          post_req.on("error", (e) => {
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
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: Finished scan with high risk findings 🚨 Please review results in the ExtensionTotal pane.`
    );
  } else {
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: Finished scan with no high risk findings. Review results in the ExtensionTotal pane.`
    );
  }
}

function reloadAccordingToConfig(context, providers) {
  const { provider, welcomeProvider } = providers;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "extensiontotal-welcome",
      welcomeProvider
    )
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("extensiontotal-results", provider)
  );

  const options = {
    treeDataProvider: provider,
  };

  const tree = vscode.window.createTreeView("extensiontotal-results", options);
  tree.onDidChangeSelection((e) => {
    const selected: any = e.selection[0];
    vscode.env.openExternal(
      vscode.Uri.parse(
        `https://app.extensiontotal.com/report/${selected.extensionId}`
      )
    );
  });
}

async function transitionApiKey(apiKeyManager) {
  if (apiKeyManager.getApiKey()) {
    return;
  }
  const config = vscode.workspace.getConfiguration("extensiontotal");
  const target = vscode.ConfigurationTarget.Global;
  const apiKey = config.get("apiKeySetting");
  console.log(`found old apiKey ${apiKey}`);
  if (apiKey) {
    await apiKeyManager.setApiKey(apiKey);
  }
  await config.update("apiKeySetting", "", target);
}

export async function activate(context: vscode.ExtensionContext) {
  const apiKeyManager = new APIKeyManager(context);
  await apiKeyManager.initialize();

  const provider = new ExtensionResultProvider(context);
  const welcomeProvider = new WelcomeViewProvider(context, apiKeyManager);

  await transitionApiKey(apiKeyManager);

  if (!apiKeyManager.getApiKey()) {
    vscode.window.showInformationMessage(
      `📡 ExtensionTotal: No API key found, Please set your API key in the ExtensionTotal panel.`
    );
  }

  const scanHandler = async (isManualScan = false) => {
    const config = vscode.workspace.getConfiguration("extensiontotal");
    const scanOnlyNewVersion = config.get("scanOnlyNewVersions");
    const scanInterval = config.get("scanEveryXHours");
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
    vscode.commands.registerCommand("ExtensionTotal.scan", () =>
      scanHandler(true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ExtensionTotal.setApiKey", async () => {
      const newApiKey = await vscode.window.showInputBox({
        prompt: "Enter your ExtensionTotal API Key",
        password: true,
      });
      if (newApiKey) {
        await apiKeyManager.setApiKey(newApiKey);
      }
    })
  );

  const config = vscode.workspace.getConfiguration("extensiontotal");
  const scanOnStartup = config.get("scanOnStartup");

  if (scanOnStartup) {
    scanHandler(false);
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
