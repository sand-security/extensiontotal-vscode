import vscode from "vscode";

import { APIKeyManager } from "./ApiKeyManager";
import { ExtensionResultProvider } from "./ExtensionResultProvider";
import { scanExtensions } from "./scanExtensions";
import { OrgIdManager } from "./OrgIdManager";
import { WelcomeViewProvider } from "./WelcomeViewProvider";

export async function activate(context: vscode.ExtensionContext) {
  const orgIdManager = new OrgIdManager(context);
  await orgIdManager.initialize();

  const apiKeyManager = new APIKeyManager(context, orgIdManager.orgId);
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
    const scanOnlyNewVersion: boolean = config.get("scanOnlyNewVersions");
    const scanInterval: number = config.get("scanEveryXHours");
    const currentApiKey = apiKeyManager.getApiKey();
    const isOrgMode = orgIdManager.isOrgMode()

    await scanExtensions(
      context,
      currentApiKey,
      {
        scanOnlyNewVersion,
        scanInterval,
        provider,
        isOrgMode
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

export function deactivate() {}

function reloadAccordingToConfig(context: vscode.ExtensionContext, providers) {
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

async function transitionApiKey(apiKeyManager: APIKeyManager) {
  if (apiKeyManager.getApiKey()) {
    return;
  }
  const config = vscode.workspace.getConfiguration("extensiontotal");
  const target = vscode.ConfigurationTarget.Global;
  const apiKey: string = config.get("apiKeySetting");
  console.log(`found old apiKey ${apiKey}`);
  if (apiKey) {
    await apiKeyManager.quietSetApiKey(apiKey);
  }
  await config.update("apiKeySetting", "", target);
}
