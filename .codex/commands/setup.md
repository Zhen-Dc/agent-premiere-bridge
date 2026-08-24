---
description: Install and configure Agent Premiere Bridge on this PC
---

You are setting up Agent Premiere Bridge after the repo has been cloned or pulled.

Run the repository bootstrap from the project root. If the user has already named approved media/project folders in the conversation, pass each one with `-ApprovedFolder`. If they have not, run the command without folder arguments so the setup script can ask.

```powershell
.\setup.bat
```

Use approved folders when known:

```powershell
.\setup.bat -ApprovedFolder "D:\Client Ads" -ApprovedFolder "D:\SFX"
```

The bootstrap installs/checks free dependencies, detects Premiere, installs the CEP extension, creates local config, and leaves paid/manual services to the user.

If installation needs admin/UAC, request approval normally. Do not attempt to automate paid sign-ins, Adobe licensing, or paid third-party API setup without user-provided credentials.
