import vscode from "vscode";

export class ScanResult extends vscode.TreeItem {
  riskLabel;
  extensionId;
  risk;
  extensionName;

  constructor(extensionId, extensionName, riskLabel, risk, collapsibleState) {
    super(extensionName, collapsibleState);
    this.riskLabel = riskLabel;
    this.extensionId = extensionId;
    this.risk = risk;
    this.extensionName = extensionName;
  }

  // @ts-ignore
  get tooltip() {
    return `${this.extensionName} with ${this.riskLabel} risk`;
  }

  // @ts-ignore
  get description() {
    return `${this.riskLabel} Risk (${this.risk.toFixed(2)})`;
  }

  contextValue = "scan-result";
}
