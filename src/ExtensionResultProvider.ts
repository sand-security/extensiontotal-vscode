import _ from "lodash";
import vscode from "vscode";
import { ScanResult } from "./ScanResult";

export class ExtensionResultProvider {
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  context;
  results;

  constructor(context) {
    this.context = context;
    let savedResults = JSON.parse(
      this.context.globalState.get(`extensiontotal-scan-results`, "[]")
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
    this._onDidChangeTreeData.fire(undefined);
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
          this.context.globalState.get(`extensiontotal-scan-results`, "[]")
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
      _.orderBy(Object.values(this.results), "risk", "desc")
    );
  }
}
