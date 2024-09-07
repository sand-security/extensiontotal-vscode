import https from "https";
import vscode from "vscode";

import { sleep } from "./utils";

export async function scanExtensions(
  context: vscode.ExtensionContext,
  apiKey: string,
  config,
  isManualScan = false
) {
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

  const progressOptions: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: `📡 ExtensionTotal: Running scan on ${extensions.length} extensions...`,
    cancellable: true,
  };

  await vscode.window.withProgress(progressOptions, async (progress, token) => {
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
                  context.globalState.update(`alerted-${extension.id}`, "yes");
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
          vscode.window.showErrorMessage(`📡 ExtensionTotal: ${e.toString()}`);
          resolve();
        });
      });

      if (limitReached || invalidApiKey) {
        break;
      }

      await sleep(1500);
    }
  });

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

async function sendScanRequest() {}
