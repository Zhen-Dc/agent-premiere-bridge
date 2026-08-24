# Agent Premiere Bridge

Localhost bridge between AI agents and Adobe Premiere Pro.

The first milestone is intentionally conservative:

- Node server bound to `127.0.0.1`
- Tokenless localhost API by default
- Approved-folder validation for media imports
- CEP panel inside Premiere
- Automatic polling for pending jobs
- Automatic execution while the panel is open
- ExtendScript executor for Premiere actions
- Job history and file logs

## Portable Setup On A New PC

Install Node.js 20 or newer, install Adobe Premiere Pro, then clone the bridge:

```powershell
git clone https://github.com/YOUR-USERNAME/agent-premiere-bridge.git
cd agent-premiere-bridge
```

Run setup with the folders that the bridge is allowed to access:

```powershell
.\Setup Bridge.bat -ApprovedFolder "D:\Client Ads" -ApprovedFolder "D:\SFX"
```

The setup script:

- checks for Node.js 20 or newer
- detects the installed Premiere Pro executable and version
- installs the CEP extension into the current Windows user's Adobe CEP extension folder
- enables CEP debug mode only for the detected Premiere/CEP generation
- creates `bridge.config.json` for that machine
- stores only that PC's approved media/project folders

Do not copy another machine's `bridge.config.json`. It is intentionally ignored by Git because it contains local paths and machine-specific settings.

## Daily Use

Start the bridge without opening a terminal yourself:

```powershell
.\Launch Bridge.bat
```

The agent can also launch the bridge directly from this interface by running:

```powershell
npm run launch
```

To also ask Windows to open Premiere:

```powershell
.\Launch Bridge.bat -OpenPremiere
```

To open a specific project:

```powershell
.\Launch Bridge.bat -ProjectPath "D:\Client Ads\Project\premiere\Project.prproj"
```

Adobe does not provide a reliable supported command-line switch for opening a CEP panel inside Premiere. The practical setup is: open `Window > Extensions > Agent Premiere Bridge` once, dock it in the workspace, and save the workspace. After that, launching the project normally should keep the panel available and auto-polling.

## Generic Agent Edit Plans

Your Claude/Hyperframes/FFmpeg/Higgsfield workflow should output a project-relative edit plan instead of hardcoding an ad inside the bridge:

```powershell
npm run queue:edit-plan -- "D:\Client Ads\Project\manifests\edit-plan.json"
```

The edit plan can describe A-roll, B-roll, generated assets, SFX, markers, and captions. B-roll items default to silent, so their linked audio is removed when inserted.

See `examples/edit-plan.example.json`.

## Manual Quick Start

1. Start the bridge once to generate `bridge.config.json`.

```powershell
npm start
```

2. Stop the server, edit `bridge.config.json`, and add the folders Premiere is allowed to import media from.

```json
{
  "approvedFolders": [
    "D:/Video Projects"
  ]
}
```

3. Install the CEP panel.

```powershell
npm run install:cep
```

If Premiere does not show the extension after restart, run this from a normal, non-admin PowerShell window:

```powershell
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

4. Restart Premiere Pro and open:

```text
Window > Extensions > Agent Premiere Bridge
```

5. Start the bridge server again.

```powershell
npm start
```

6. Queue a job.

```powershell
npm run queue -- examples/markers.job.json
```

The panel will pick it up automatically and run it while the panel is open.

## Diagnostics

```powershell
npm run diagnostics
```

## Project layout

```text
server/       Localhost API, queue, logs
cli/          Command-line helper for queueing jobs
cep-panel/    Adobe CEP panel copied into Premiere's extension folder
examples/     Example job JSON files
scripts/      Installer and diagnostics scripts
docs/         Command protocol notes
```

## Current v1 limits

Premiere's scripting API does not expose every editing feature. This bridge starts with reliable automation around project setup, bins, imports, sequence creation from clips where available, and markers. More advanced editing commands can be added as tested command modules.

