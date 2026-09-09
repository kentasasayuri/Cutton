# Shared implementation contract

This document coordinates implementation. Local only, default 127.0.0.1:4318. Root owns package/build/scripts/bin/exporters/tests/docs. Backend worker owns server/ except server/codex.mjs (root). Frontend worker owns src/, index.html, vite.config.js, public/. Do not undo other workers' edits.

## State

GET /api/state -> state object. POST /api/command {command,args} -> {state,result}. Errors HTTP 400+ {error:string}. POST /api/upload multipart field files (multiple), optional sceneId -> {state,result:assets[]}. GET /media/:assetId serves original with Range support. GET /api/capabilities -> {commands:[{name,description,args?}], integrations:{...}}. GET /api/events SSE event data state (optional polling UI works too). GET /api/download?path=... confines to data/exports.

state = {id,name,fps:30,width:1920,height:1080,updatedAt,storyboard:[],assets:[],clips:[],decisions:[],jobs:[],settings:{comfyUrl:'http://127.0.0.1:8188',vidsUrl:'',codexModel:''}}
scene = {id,title,description,narration,duration,order,required:['video','audio']}. duration seconds. order zero-based.
asset = {id,name,kind:'video'|'audio'|'image',path,url:'/media/id',duration,sha256,streamHashes:{video?,audio?},size,sceneId:null,decision:'pending'|'accepted'|'rejected',width?,height?,hasAudio?,createdAt}
clip = {id,assetId,sceneId,track:'video'|'audio',start,in,duration,gain:1,muted:false}. seconds. Video embedded audio muted by default; audio track explicitly uses audio streams. No overlapping clips on same track (reject invalid move/add). image clips can have arbitrary duration. No destructive source modifications.
job = {id,type,status:'queued'|'running'|'completed'|'failed'|'awaiting_import',prompt,sceneId?,createdAt,result?,error?}
decision = {id,assetId,decision,reason,createdAt}

## Commands (all accessible via same dispatcher)

- project.rename {name}; project.new {name} (archives current project).
- storyboard.add {title,description?,narration?,duration:5,required?:['video','audio']}; storyboard.update {id,...fields}; storyboard.remove {id}; storyboard.reorder {ids}.
- plan.create {prompt,duration:30,mode:'local'|'codex'} => result plan; local deterministic scaffold explicitly labeled, codex calls root codex module. Add/replace scenes? plan.create REPLACES storyboard only when no clips (otherwise rejects). UI warns/uses empty project.
- asset.import {path,sceneId?}; asset.assign {id,sceneId}; asset.decide {id,decision,reason}; asset.verify {id?}; asset.remove {id} (reject when referenced; preserve original physical file).
- timeline.add {assetId,sceneId?,track,start?,in?:0,duration?}; timeline.update {id,...fields}; timeline.remove {id}; timeline.split {id,at} absolute project seconds; timeline.arrange {} places accepted scene-assigned assets in storyboard order, one per scene and track; explicit invocation rebuilds timeline. timeline.clear {}.
- settings.update {comfyUrl?,vidsUrl?,codexModel?}; integrations.check {} returns reachability ffmpeg/codex/comfy.
- generation.submit {kind:'video'|'audio'|'image',prompt,sceneId?,workflow:object,seed?} generic Comfy API workflow using {{prompt}} and {{seed}} string tokens; generation.refresh {id} imports completed outputs preserving kind separately.
- narration.prepare {prompt,sceneId?,mode:'local'|'codex',language?:'ja-JP',voice?:string} creates Google Vids handoff JSON/text in exports incl script derived by Codex if selected (local uses provided exact text, never claims AI-generated). Job awaiting_import. Browser UI opens saved settings.vidsUrl or docs.google.com/videos/ home only. No fabricated Vids API. narration.import {path,sceneId?,jobId?} reuses asset import; supports Vids MP4 extracting audio lossless if possible; backend requirement check.
- export.create {format:'bundle'|'otio'|'fcpxml'|'edl'|'render'|'clips'} root exporters module exportProject(state,{format,dataDir}) -> {path,url?,files?,warnings?}. bundle folder + zip? source copies with manifest hashes, JSON. render explicitly transcoding MP4, other formats no render.
- decisions.export {} generates SKILL.md from decisions (download).

Root server/codex.mjs will export async generatePlan({prompt,duration,model,cwd}) -> scenes[]; async generateNarration({prompt,language,voice,model,cwd}) -> string. It must only start Codex when requested.
Root exporters/index.mjs will export async exportProject(state,{format,dataDir}). server dynamically imports these modules within respective commands.

Backend exports createApp({dataDir?}) -> express app and createStore({dataDir?}) if convenient for tests. Port set via YACHICUT_PORT, data directory via YACHICUT_DATA_DIR. Source import uses copies into data/assets. Every mutation serialized, persist atomic JSON. Browser source importing local path is allowed for loopback user app; reject cross-origin mutation/Host DNS rebinding, validate identifiers/timing, limit uploads, path-constrain downloads.

UI Japanese. High quality dense editor, navy/slate with teal video and lavender audio, light parchment storyboard cards as visual signature. Main workbench: top header, left assets, center preview + storyboard, right inspector/generation/narration; bottom timeline. Actual video and audio playback synchronized to playhead; data-action and data-entity-id on all actionable controls, accessible roles/labels. Command palette with API metadata. Settings/integrations dialogs. Asset upload, scene edits, clip trim/split/move, decisions, generation workflow JSON, Google Vids handoff and audio import, exports downloadable. Show accurate missing assets and coverage using timeline intervals per scene per required track, cap at scene.duration. Empty initial project plus clearly labeled demo button if demo content implemented. Every button works or disabled with reason; no fake connected/completed states.
