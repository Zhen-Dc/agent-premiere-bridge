# Command Protocol

Every job sent to the bridge has a human-readable `plan` and a machine-readable `command`.
The Premiere panel polls for pending jobs, displays both fields, and waits for approval before running the command.

```json
{
  "plan": "Explain exactly what Premiere will do.",
  "command": {
    "action": "import_media"
  }
}
```

### assemble_sequence

Builds an editable sequence with base A-roll, overlay clips, audio clips, and timeline markers. Clip specs can include `inSeconds`, `outSeconds`, `durationSeconds`, `trackIndex`, and `scale`.

### create_srt_file

Writes an `.srt` caption sidecar and imports it into the Premiere project.

### inspect_sequence

Returns a best-effort report of the active sequence tracks and clips.

### save_project

Saves the current Premiere project.
```

## Security model

- Server binds to `127.0.0.1`.
- API calls are tokenless when `requireToken` is `false` in `bridge.config.json`.
- Media paths must live inside `approvedFolders` from `bridge.config.json`.
- Opening the Premiere panel is the local consent step; pending jobs run automatically while the panel is open.
- Jobs are stored in `server/data/jobs.json`.
- Logs are written to `server/logs/bridge.log`.

## Actions

### diagnostic

Returns Premiere app/project status.

```json
{
  "plan": "Check Premiere bridge status.",
  "command": {
    "action": "diagnostic"
  }
}
```

### create_project

Creates a project only when Premiere does not already have one open.

```json
{
  "plan": "Create a new Premiere project at the selected path if no project is currently open.",
  "command": {
    "action": "create_project",
    "projectPath": "D:/Video Projects/Test/Test.prproj"
  }
}
```

### create_bin

```json
{
  "plan": "Create a bin named Codex Imports.",
  "command": {
    "action": "create_bin",
    "name": "Codex Imports"
  }
}
```

### import_media

Imports approved files into a target bin.

```json
{
  "plan": "Import selected files into Codex Imports.",
  "command": {
    "action": "import_media",
    "binName": "Codex Imports",
    "files": ["D:/Video Projects/sample/interview01.mp4"]
  }
}
```

### create_sequence_from_clips

Creates a sequence from existing imported project items. Premiere's scripting support for sequence creation varies; this action reports a clear error if the API is unavailable.

```json
{
  "plan": "Create a rough-cut sequence from interview01.mp4.",
  "command": {
    "action": "create_sequence_from_clips",
    "name": "Rough Cut v1",
    "binName": "Codex Imports",
    "clipNames": ["interview01.mp4"]
  }
}
```

### add_markers

Adds markers to the active sequence.

```json
{
  "plan": "Add editorial markers to the active sequence.",
  "command": {
    "action": "add_markers",
    "markers": [
      {
        "timeSeconds": 12,
        "name": "Topic Change",
        "comment": "Shift into the main explanation."
      }
    ]
  }
}
```

### compound

Runs multiple steps in order.

```json
{
  "plan": "Create a bin, import media, and add timeline markers.",
  "command": {
    "action": "compound",
    "steps": [
      { "action": "create_bin", "name": "Codex Rough Cut" },
      { "action": "import_media", "binName": "Codex Rough Cut", "files": ["D:/Video Projects/sample/interview01.mp4"] },
      { "action": "add_markers", "markers": [{ "timeSeconds": 0, "name": "Start" }] }
    ]
  }
}
