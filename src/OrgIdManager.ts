import vscode from "vscode";
import os from "os";
import { exec } from "child_process";

export class OrgIdManager {
  private SECRET_NAME = "extensiontotal.orgId";
  private MAC_DEFAULTS_DOMAIN = "com.extensiontotal.vs-code";
  private MAC_DEFAULTS_KEY_NAME = "OrgId";
  private context: vscode.ExtensionContext;

  orgId: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async initialize() {
    console.log("searching for org id");
    await this.checkOrgIdSecret();
    if (this.orgId) return;
    if (isMac()) {
      await this.checkOrgIdMac();
    } else {
      console.log("checkOrgIdWindows not implemented yet...");
    }
  }

  isOrgMode() {
    return !!this.orgId;
  }

  private async checkOrgIdSecret() {
    const orgId = await this.context.secrets.get(this.SECRET_NAME);
    await this.setOrgId(orgId);
  }

  private async setOrgId(newOrgId) {
    if (newOrgId) {
      console.log("org id found, operating in org mode");
      await this.context.secrets.store(this.SECRET_NAME, newOrgId);
      this.orgId = newOrgId;
    }
  }

  async checkOrgIdMac() {
    try {
      const orgId = await execPromise(
        `defaults read ${this.MAC_DEFAULTS_DOMAIN} ${this.MAC_DEFAULTS_KEY_NAME}`
      );
      if (orgId) {
        await this.setOrgId(orgId);
      }
      await execPromise(
        `defaults delete ${this.MAC_DEFAULTS_DOMAIN} ${this.MAC_DEFAULTS_KEY_NAME}`
      );
    } catch {
      return;
    }
  }
}

function isMac() {
  const platform = os.platform();
  return platform === "darwin";
}

async function execPromise(command: string) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(`Error: ${error.message}`);
        return;
      }

      if (stderr) {
        reject(`stderr: ${stderr}`);
        return;
      }

      resolve(stdout.trim());
    });
  });
}
