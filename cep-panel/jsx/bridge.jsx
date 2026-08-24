var AgentPremiereBridge = AgentPremiereBridge || {};

(function () {
  function result(ok, payload) {
    payload = payload || {};
    payload.ok = ok;
    return JSON.stringify(payload);
  }

  function fail(message) {
    return result(false, { error: message });
  }

  function rootItem() {
    if (!app.project) {
      return null;
    }
    return app.project.rootItem;
  }

  function findChildByName(parent, name) {
    if (!parent || !parent.children) {
      return null;
    }
    for (var i = 0; i < parent.children.numItems; i += 1) {
      var child = parent.children[i];
      if (child && child.name === name) {
        return child;
      }
    }
    return null;
  }

  function ensureBin(name) {
    var root = rootItem();
    if (!root) {
      throw new Error("No Premiere project is open.");
    }
    var existing = findChildByName(root, name);
    if (existing) {
      return existing;
    }
    root.createBin(name);
    return findChildByName(root, name);
  }

  function findProjectItemByName(parent, name) {
    if (!parent || !parent.children) {
      return null;
    }
    for (var i = 0; i < parent.children.numItems; i += 1) {
      var child = parent.children[i];
      if (child && child.name === name) {
        return child;
      }
      var nested = findProjectItemByName(child, name);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  function findOrImportByPath(filePath, binName) {
    var name = filePath.replace(/\\/g, "/").split("/").pop();
    var existing = findProjectItemByName(rootItem(), name);
    if (existing) {
      return existing;
    }
    var targetBin = binName ? ensureBin(binName) : rootItem();
    app.project.importFiles([filePath], true, targetBin, false);
    existing = findProjectItemByName(rootItem(), name);
    if (!existing) {
      throw new Error("Could not import or find project item: " + name);
    }
    return existing;
  }

  function seconds(value) {
    return String(Number(value || 0));
  }

  function timeObject(value) {
    var time = new Time();
    time.seconds = Number(value || 0);
    return time;
  }

  function tryCall(label, fn, warnings) {
    try {
      return fn();
    } catch (error) {
      if (warnings) {
        warnings.push(label + ": " + (error.message || String(error)));
      }
      return null;
    }
  }

  function setProjectItemTrim(projectItem, spec, warnings) {
    if (spec.inSeconds === undefined && spec.outSeconds === undefined) {
      return;
    }
    if (spec.inSeconds !== undefined && projectItem.setInPoint) {
      tryCall("setInPoint " + projectItem.name, function () {
        projectItem.setInPoint(timeObject(spec.inSeconds).ticks, 4);
      }, warnings);
    }
    if (spec.outSeconds !== undefined && projectItem.setOutPoint) {
      tryCall("setOutPoint " + projectItem.name, function () {
        projectItem.setOutPoint(timeObject(spec.outSeconds).ticks, 4);
      }, warnings);
    }
  }

  function insertClipOnTrack(sequence, projectItem, trackType, trackIndex, startSeconds) {
    var tracks = trackType === "audio" ? sequence.audioTracks : sequence.videoTracks;
    if (!tracks || tracks.numTracks <= trackIndex) {
      throw new Error("Missing " + trackType + " track index " + trackIndex);
    }
    if (tracks[trackIndex].overwriteClip) {
      tracks[trackIndex].overwriteClip(projectItem, timeObject(startSeconds));
    } else {
      tracks[trackIndex].insertClip(projectItem, timeObject(startSeconds));
    }
  }

  function findTrackItemAt(sequence, trackIndex, name, startSeconds) {
    var track = sequence.videoTracks[trackIndex];
    if (!track || !track.clips) {
      return null;
    }
    var target = Number(startSeconds || 0);
    for (var i = 0; i < track.clips.numItems; i += 1) {
      var clip = track.clips[i];
      var clipStart = clip && clip.start ? Number(clip.start.seconds) : -9999;
      if (clip && clip.name === name && Math.abs(clipStart - target) < 0.5) {
        return clip;
      }
    }
    return null;
  }

  function setTimelineClipScale(trackItem, scale, warnings) {
    if (!trackItem || scale === undefined || !trackItem.components) {
      return;
    }
    tryCall("set scale " + trackItem.name, function () {
      for (var i = 0; i < trackItem.components.numItems; i += 1) {
        var component = trackItem.components[i];
        if (component && component.displayName === "Motion" && component.properties) {
          for (var p = 0; p < component.properties.numItems; p += 1) {
            var prop = component.properties[p];
            if (prop && prop.displayName === "Scale") {
              prop.setValue(Number(scale), true);
              return;
            }
          }
        }
      }
      throw new Error("Motion > Scale property not found.");
    }, warnings);
  }

  function removeMatchingAudioClips(sequence, name, startSeconds, durationSeconds, warnings) {
    if (!sequence || !sequence.audioTracks || !name) {
      return 0;
    }
    var removed = 0;
    var targetStart = Number(startSeconds || 0);
    var targetEnd = targetStart + Number(durationSeconds || 0);
    for (var a = 0; a < sequence.audioTracks.numTracks; a += 1) {
      var track = sequence.audioTracks[a];
      if (!track || !track.clips) {
        continue;
      }
      for (var c = track.clips.numItems - 1; c >= 0; c -= 1) {
        var clip = track.clips[c];
        if (!clip || clip.name !== name) {
          continue;
        }
        var clipStart = clip.start ? Number(clip.start.seconds) : -9999;
        var clipEnd = clip.end ? Number(clip.end.seconds) : -9999;
        var startsNearTarget = Math.abs(clipStart - targetStart) < 0.5;
        var overlapsTarget = clipStart < targetEnd + 0.5 && clipEnd > targetStart - 0.5;
        if (startsNearTarget || overlapsTarget) {
          tryCall("remove linked B-roll audio " + name, function () {
            clip.remove(false, false);
          }, warnings);
          removed += 1;
        }
      }
    }
    return removed;
  }

  function addSequenceMarker(sequence, markerInput) {
    var marker = sequence.markers.createMarker(Number(markerInput.timeSeconds || 0));
    marker.name = markerInput.name || "Agent Note";
    marker.comments = markerInput.comment || "";
    if (markerInput.durationSeconds) {
      marker.end = Number(markerInput.timeSeconds || 0) + Number(markerInput.durationSeconds);
    }
  }

  function assembleSequence(command) {
    if (!command.name) {
      throw new Error("assemble_sequence requires name.");
    }
    if (!command.baseClips || !command.baseClips.length) {
      throw new Error("assemble_sequence requires baseClips.");
    }

    var warnings = [];
    var removedOverlayAudioCount = 0;
    var sourceBin = command.binName || "Agent Edit Assets";
    var sequenceBin = ensureBin(sourceBin);
    var firstClip = findOrImportByPath(command.baseClips[0].file, sourceBin);
    setProjectItemTrim(firstClip, command.baseClips[0], warnings);
    var sequence = app.project.createNewSequenceFromClips(command.name, [firstClip], sequenceBin);
    if (!sequence) {
      sequence = app.project.activeSequence;
    }
    if (!sequence) {
      throw new Error("Premiere did not create an active sequence.");
    }

    var firstTimelineClip = findTrackItemAt(sequence, 0, firstClip.name, 0);
    setTimelineClipScale(firstTimelineClip, command.baseClips[0].scale, warnings);

    var cursor = Number(command.baseClips[0].durationSeconds || 0);
    for (var i = 1; i < command.baseClips.length; i += 1) {
      var baseSpec = command.baseClips[i];
      var clip = findOrImportByPath(baseSpec.file, sourceBin);
      setProjectItemTrim(clip, baseSpec, warnings);
      insertClipOnTrack(sequence, clip, "video", 0, cursor);
      setTimelineClipScale(findTrackItemAt(sequence, 0, clip.name, cursor), baseSpec.scale, warnings);
      cursor += Number(baseSpec.durationSeconds || 0);
    }

    if (command.overlays) {
      for (var j = 0; j < command.overlays.length; j += 1) {
        var overlay = command.overlays[j];
        var overlayItem = findOrImportByPath(overlay.file, overlay.binName || sourceBin);
        setProjectItemTrim(overlayItem, overlay, warnings);
        insertClipOnTrack(sequence, overlayItem, "video", overlay.trackIndex || 1, overlay.startSeconds || 0);
        setTimelineClipScale(findTrackItemAt(sequence, overlay.trackIndex || 1, overlayItem.name, overlay.startSeconds || 0), overlay.scale, warnings);
        if (overlay.silent !== false) {
          removedOverlayAudioCount += removeMatchingAudioClips(
            sequence,
            overlayItem.name,
            overlay.startSeconds || 0,
            overlay.durationSeconds || 0,
            warnings
          );
        }
      }
    }

    if (command.audio) {
      for (var k = 0; k < command.audio.length; k += 1) {
        var audio = command.audio[k];
        var audioItem = findOrImportByPath(audio.file, audio.binName || "SFX");
        insertClipOnTrack(sequence, audioItem, "audio", audio.trackIndex || 1, audio.startSeconds || 0);
      }
    }

    if (command.markers) {
      for (var m = 0; m < command.markers.length; m += 1) {
        addSequenceMarker(sequence, command.markers[m]);
      }
    }

    return {
      action: "assemble_sequence",
      name: command.name,
      baseClipCount: command.baseClips.length,
      overlayCount: command.overlays ? command.overlays.length : 0,
      audioCount: command.audio ? command.audio.length : 0,
      removedOverlayAudioCount: removedOverlayAudioCount,
      markerCount: command.markers ? command.markers.length : 0
      ,
      warnings: warnings
    };
  }

  function formatSrtTime(totalSeconds) {
    var ms = Math.floor((Number(totalSeconds || 0) % 1) * 1000);
    var whole = Math.floor(Number(totalSeconds || 0));
    var s = whole % 60;
    var m = Math.floor(whole / 60) % 60;
    var h = Math.floor(whole / 3600);
    function pad(value, size) {
      var text = String(value);
      while (text.length < size) text = "0" + text;
      return text;
    }
    return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2) + "," + pad(ms, 3);
  }

  function createSrtFile(command) {
    if (!command.outputPath) {
      throw new Error("create_srt_file requires outputPath.");
    }
    if (!command.captions || !command.captions.length) {
      throw new Error("create_srt_file requires captions.");
    }
    var file = new File(command.outputPath);
    if (!file.open("w")) {
      throw new Error("Could not write SRT: " + command.outputPath);
    }
    for (var i = 0; i < command.captions.length; i += 1) {
      var caption = command.captions[i];
      file.writeln(String(i + 1));
      file.writeln(formatSrtTime(caption.startSeconds) + " --> " + formatSrtTime(caption.endSeconds));
      file.writeln(caption.text);
      file.writeln("");
    }
    file.close();
    if (command.importIntoProject !== false) {
      var targetBin = ensureBin(command.binName || "Captions");
      app.project.importFiles([command.outputPath], true, targetBin, false);
    }
    return { action: "create_srt_file", outputPath: command.outputPath, captionCount: command.captions.length };
  }

  function inspectSequence() {
    var sequence = app.project.activeSequence;
    if (!sequence) {
      throw new Error("No active sequence is open.");
    }
    var report = {
      action: "inspect_sequence",
      name: sequence.name,
      videoTracks: [],
      audioTracks: []
    };
    for (var v = 0; v < sequence.videoTracks.numTracks; v += 1) {
      var vTrack = sequence.videoTracks[v];
      var vClips = [];
      for (var vc = 0; vc < vTrack.clips.numItems; vc += 1) {
        var vClip = vTrack.clips[vc];
        vClips.push({
          name: vClip.name,
          start: vClip.start ? vClip.start.seconds : null,
          end: vClip.end ? vClip.end.seconds : null
        });
      }
      report.videoTracks.push({ index: v, clips: vClips });
    }
    for (var a = 0; a < sequence.audioTracks.numTracks; a += 1) {
      var aTrack = sequence.audioTracks[a];
      var aClips = [];
      for (var ac = 0; ac < aTrack.clips.numItems; ac += 1) {
        var aClip = aTrack.clips[ac];
        aClips.push({
          name: aClip.name,
          start: aClip.start ? aClip.start.seconds : null,
          end: aClip.end ? aClip.end.seconds : null
        });
      }
      report.audioTracks.push({ index: a, clips: aClips });
    }
    return report;
  }

  function listSequences() {
    var sequences = [];
    if (app.project && app.project.sequences) {
      for (var i = 0; i < app.project.sequences.numSequences; i += 1) {
        var sequence = app.project.sequences[i];
        sequences.push({
          name: sequence.name,
          sequenceID: sequence.sequenceID || null
        });
      }
    }
    return sequences;
  }

  function activateSequence(command) {
    if (!command.name) {
      throw new Error("activate_sequence requires name.");
    }
    var sequences = listSequences();
    for (var i = 0; i < sequences.length; i += 1) {
      if (sequences[i].name === command.name) {
        if (!app.project.openSequence) {
          throw new Error("Premiere scripting API does not expose app.project.openSequence.");
        }
        app.project.openSequence(sequences[i].sequenceID);
        return { action: "activate_sequence", name: command.name, sequenceID: sequences[i].sequenceID };
      }
    }
    throw new Error("Sequence not found: " + command.name);
  }

  function saveProject() {
    if (!app.project) {
      throw new Error("No Premiere project is open.");
    }
    app.project.save();
    return { action: "save_project", projectPath: app.project.path || null };
  }

  function importMedia(command) {
    if (!command.files || !command.files.length) {
      throw new Error("import_media requires files.");
    }
    var targetBin = command.binName ? ensureBin(command.binName) : rootItem();
    var imported = app.project.importFiles(command.files, true, targetBin, false);
    return {
      action: "import_media",
      imported: imported,
      count: command.files.length,
      binName: command.binName || null
    };
  }

  function createBin(command) {
    if (!command.name) {
      throw new Error("create_bin requires name.");
    }
    ensureBin(command.name);
    return { action: "create_bin", name: command.name };
  }

  function createProject(command) {
    if (!command.projectPath) {
      throw new Error("create_project requires projectPath.");
    }
    if (app.project && app.project.path && !command.force) {
      return { action: "create_project", skipped: true, message: "A project is already open." };
    }
    app.newProject(command.projectPath);
    return { action: "create_project", projectPath: command.projectPath };
  }

  function createSequenceFromClips(command) {
    if (!command.name) {
      throw new Error("create_sequence_from_clips requires name.");
    }
    if (!command.clipNames || !command.clipNames.length) {
      throw new Error("create_sequence_from_clips requires clipNames.");
    }
    if (!app.project.createNewSequenceFromClips) {
      throw new Error("This Premiere scripting API does not expose createNewSequenceFromClips.");
    }

    var sourceRoot = command.binName ? ensureBin(command.binName) : rootItem();
    var clips = [];
    for (var i = 0; i < command.clipNames.length; i += 1) {
      var clip = findProjectItemByName(sourceRoot, command.clipNames[i]);
      if (clip) {
        clips.push(clip);
      }
    }
    if (!clips.length) {
      throw new Error("No matching clips found for sequence creation.");
    }
    var sequence = app.project.createNewSequenceFromClips(command.name, clips, sourceRoot);
    return {
      action: "create_sequence_from_clips",
      name: command.name,
      clipCount: clips.length,
      sequence: sequence ? sequence.name : command.name
    };
  }

  function addMarkers(command) {
    if (!app.project.activeSequence) {
      throw new Error("No active sequence is open.");
    }
    if (!command.markers || !command.markers.length) {
      throw new Error("add_markers requires markers.");
    }
    var markers = app.project.activeSequence.markers;
    for (var i = 0; i < command.markers.length; i += 1) {
      var input = command.markers[i];
      var marker = markers.createMarker(Number(input.timeSeconds || 0));
      marker.name = input.name || "Agent Marker";
      marker.comments = input.comment || "";
      if (input.durationSeconds) {
        marker.end = Number(input.timeSeconds || 0) + Number(input.durationSeconds);
      }
    }
    return { action: "add_markers", count: command.markers.length };
  }

  function diagnostic() {
    return {
      action: "diagnostic",
      appName: app.appName,
      appVersion: app.version,
      hasProject: !!app.project,
      projectPath: app.project ? app.project.path : null,
      activeSequence: app.project && app.project.activeSequence ? app.project.activeSequence.name : null,
      sequences: listSequences()
    };
  }

  function runCommand(command) {
    if (!command || !command.action) {
      throw new Error("Command requires action.");
    }
    if (command.action === "diagnostic") return diagnostic(command);
    if (command.action === "import_media") return importMedia(command);
    if (command.action === "create_bin") return createBin(command);
    if (command.action === "add_markers") return addMarkers(command);
    if (command.action === "create_project") return createProject(command);
    if (command.action === "create_sequence_from_clips") return createSequenceFromClips(command);
    if (command.action === "assemble_sequence") return assembleSequence(command);
    if (command.action === "back_in_80s_edit") return assembleSequence(command);
    if (command.action === "create_srt_file") return createSrtFile(command);
    if (command.action === "inspect_sequence") return inspectSequence(command);
    if (command.action === "activate_sequence") return activateSequence(command);
    if (command.action === "save_project") return saveProject(command);
    if (command.action === "compound") {
      var outputs = [];
      for (var i = 0; i < command.steps.length; i += 1) {
        outputs.push(runCommand(command.steps[i]));
      }
      return { action: "compound", outputs: outputs };
    }
    throw new Error("Unsupported action: " + command.action);
  }

  AgentPremiereBridge.runJob = function (command) {
    try {
      return result(true, { output: runCommand(command) });
    } catch (error) {
      return fail(error.message || String(error));
    }
  };
})();

