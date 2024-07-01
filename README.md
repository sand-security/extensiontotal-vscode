# ExtensionTotal - VSCode

## Overview

**ExtensionTotal** is a free Visual Studio Code extension designed to enhance your development environment's security. By utilizing [ExtensionTotal](https://extensiontotal.com), it scans all your installed extensions, helping you identify and mitigate potential security risks.

## Features

- **Extension Scanning:** Scan all your installed extensions for security vulnerabilities.
- **Background Scanning:** ExtensionTotal continuously scans your extensions in the background whenever you open VSCode.
- **Detailed Security Reports:** Receive comprehensive reports on the security status of each extension.
- **Real-Time Alerts:** Get immediate notifications for any detected security threats.

## Installation

To install the VSCode ExtensionTotal Scanner:

1. Open Visual Studio Code.
2. Navigate to the Extensions view by clicking the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X`.
3. Search for `ExtensionTotal`.
4. Click **Install** to add the extension to your environment.

## Get an API key (Free)

ExtensionTotal's Extension **is FREE for PERSONAL USE (limited at 250 requests per day)**. To begin get your API key at [ExtensionTotal Website](https://app.extensiontotal.com/profile)

For organizational use or direct API access, visit our [ExtensionTotal Sponsorship Page](https://buymeacoffee.com/extensiontotal.security/membership) and choose a membership that suits your needs. 
We'll send the API key in 1-2 days to the email provided in the membership payment.

Note: Organizations must purchase an API key for direct API use.

## Adding Your API Key

To add your API key for ExtensionTotal:

1. Open Visual Studio Code.
2. Go to `Settings` > `Extensions` > `ExtensionTotal`.
3. Enter your API key in the provided field.

## Usage

### Real-Time Alerts

- The extension provides real-time alerts for any new security issues found in your extensions.
- Notifications will appear in VSCode, allowing you to address potential risks immediately.

## Organizations and Rate Limits

For organizations or to increase rate limits, please visit our [website](https://extensiontotal.com).

## Contributing

We welcome contributions! If you have suggestions, ideas, or bug reports, please open an issue or submit a pull request on our [GitHub repository](https://github.com/sand-security/extensiontotal-vscode).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For questions or support, please contact us at [amit@extensiontotal.com](mailto:amit@extensiontotal.com).

---

### Example scripts for API use

```powershell
$codeExtensions = $(code --list-extensions)

Write-Output += "Found $($codeExtensions.Count) extensions to check..."
$extArray = @()

foreach ($extension in $codeExtensions) {

    $headers = @{ 
        "Content-Type" = "application/json"
        "Cookie"       = "SameSite=None"
        "X-API-Key"       = "API_KEY_HERE"
    }
    
    $payload = @{
        "q" = $extension
    }

    $response = Invoke-WebRequest -Uri 'https://app.extensiontotal.com/api/getExtensionRisk' `
                                    -Method Post `
                                    -Body $( $payload | ConvertTo-Json) `
                                    -Headers $headers
    
    $responseContent = $response.Content | ConvertFrom-Json
    $extArray += $responseContent

    Start-Sleep -Seconds 10
}

$extArray | Sort-Object -Property risk -Descending | Format-Table -Property display_name, version, risk, updated_at 
```

```bash
loggedInUser=$( echo "show State:/Users/ConsoleUser" | scutil | awk '/Name :/ { print $3 }' )
codePath="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
codeExtensions=$(sudo -u "$loggedInUser" "$codePath" --list-extensions)

while IFS= read -r line || [[ -n $line ]]; do
        content=$(curl -s --location 'https://app.extensiontotal.com/api/getExtensionRisk' \
        --header 'Content-Type: application/json' \
        --header 'X-API-Key: API_KEY_HERE' \
        --header 'Cookie: SameSite=None' \
        --data "{
          \"q\": \"$line\"
        }")
        risk=$(jq -r '.risk' <<<"$content")
        echo "$line - $risk"
done < <(printf '%s' "$codeExtensions")
```

Thank you for using the VSCode ExtensionTotal Scanner! Stay secure and happy coding!

We do not collect any personal information or data regarding the user or the usage of the ExtensionTotal extension, with the exception of the API key necessary for the extension's functionality and the non-sensitive extension IDs. 

All rights reserved to Extension Total LTD. By using this extension you agree to the [privacy policy](https://www.extensiontotal.com/privacy-policy) and [terms of service](https://www.extensiontotal.com/terms-of-service).