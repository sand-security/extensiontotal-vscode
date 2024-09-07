import vscode from "vscode";
import { getNonce } from "./utils";

export class WelcomeViewProvider {
  viewType = "extensiontotal-welcome";
  _context;
  _extensionUri;
  _apiKeyManager;
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
        case "apiKeySet": {
          await this._apiKeyManager.setApiKey(data.value);
          break;
        }
      }
    });
  }

  _getHtmlForWebview(webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );

    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.css")
    );
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "icon-white.svg")
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
