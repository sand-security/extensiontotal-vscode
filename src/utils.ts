import https from "https";

export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendHttpsRequest(
  options: https.RequestOptions,
  postData?: string | object
): Promise<{ statusCode?: number; data?: any; error?: any }> {
  return new Promise((resolve, reject) => {
    // Create the request
    const req = https.request(options, (res) => {
      let data = "";

      // Set encoding
      res.setEncoding("utf8");

      // Gather data chunks
      res.on("data", (chunk) => {
        data += chunk;
      });

      // Resolve promise when the response ends
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, data });
      });
    });

    // Handle request errors
    req.on("error", (e) => {
      resolve({ error: e });
    });

    // Write any data (for POST/PUT requests) and end the request
    if (postData) {
      if (typeof postData === "object") {
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }

    req.end();
  });
}
