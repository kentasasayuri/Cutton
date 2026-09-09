---
name: yachicut-editor
description: Operate Cutton through its local CLI/MCP, plan editing points, manage shots, and generate narration through the authenticated Google Vids browser.
---

# Cutton

Use the local MCP tools `yachicut_state`, `yachicut_capabilities`, `yachicut_command`, or run `node bin/cutton.mjs` in this application directory. Start the local app first.

Read state and capabilities before edits. Plan the editing points before placing footage. Map each asset to a storyboard scene and explicitly accept/reject it with a reason. Use timeline commands for editing; browser controls have stable `data-action` and `data-entity-id` metadata. Save source provenance and separate video/audio jobs. Do not call a job complete until the provider has completed it and the output has been imported.

## Google Vids narration

When the user asks to generate narration through Google Vids:

1. Call `narration.prepare` with the user's prompt and scene ID. `mode:codex` creates a script through Codex App Server; `mode:local` treats the text as the exact script. Read the returned job, script, language, and voice.
2. Use the installed `google-vids-operator` skill and authenticated browser to open the exact configured Vids URL. If absent, use Vids home, creating a new file only when the user has requested a video/narration. Never extract authentication tokens/cookies.
3. Inspect the current DOM and locate Scripts/AI voiceover. Enter the script, verify readback, choose available Japanese voice and speaking style, generate, then confirm completion. Respect account availability and display actual failures.
4. Export/download the generated Vids MP4 using the browser. Import it with `narration.import {path,sceneId,jobId}`; Cutton extracts the existing audio stream without re-encoding where the format supports it. This is a Vids-export-derived track, not an original generated WAV.
5. Verify the imported duration and source hash, accept it when authorized, and put it on the scene's audio track. Original video preview is muted; audio is always explicitly placed.

Vids does not offer a verified public scene/script/voice-generation API. Never invent such endpoints or claim a prepared handoff has already generated voice. If Google sign-in or account permission is required, explain that exact blocker. Keep progress in the job record.

## ComfyUI

Use API-format workflow JSON from the user's configured ComfyUI. Replace `{{prompt}}` / `{{seed}}` via `generation.submit`. Refresh until the particular prompt finishes, then inspect imported outputs. Custom nodes/models are supplied by the user's ComfyUI installation. Keep image/video and audio workflows separate.

## Export and integrity

Use bundle for unchanged originals and an editable project; verify hashes. `fcpxml` command emits FCP7 `.xml` for Premiere/Resolve. CapCut handoff is sources + SRT + edit list and requires reconstruction. MP4 render re-encodes by explicit selection. SHA-256 proves byte equality; it cannot measure perceptual degradation. Decision skill exports are evidence to review, not automatically promoted instructions.
