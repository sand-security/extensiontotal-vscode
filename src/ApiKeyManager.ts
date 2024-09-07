import vscode from "vscode";

export class APIKeyManager {
  private SECRET_NAME = "extensiontotal.apiKey";
  private context: vscode.ExtensionContext;
  private currentApiKey: string;
  private orgId: string;

  constructor(context: vscode.ExtensionContext, orgId?: string) {
    this.context = context;
    this.orgId = orgId;
  }

  async initialize() {
    this.currentApiKey = await this.context.secrets.get(this.SECRET_NAME);
  }

  async quietSetApiKey(newApiKey: string) {
    await this.context.secrets.store(this.SECRET_NAME, newApiKey);
    this.currentApiKey = newApiKey;
  }
  async setApiKey(newApiKey: string) {
    if (!newApiKey) {
      vscode.window.showWarningMessage(
        `📡 ExtensionTotal: No API key found. Please set your API key in the ExtensionTotal panel.`
      );
      return;
    }
    await this.quietSetApiKey(newApiKey);
    vscode.window.showInformationMessage(
      "📡 ExtensionTotal: API key has been set successfully."
    );
  }

  getApiKey() {
    return this.orgId || this.currentApiKey;
  }
}
