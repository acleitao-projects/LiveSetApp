import {repository,importTrack,assetUrl,storageCapabilities,storageEstimate} from './storage.js?v=2';
import {newSetlist,breakItem,trackItem,STEMS} from './models.js?v=2';
import {clone,isDirty,insertAfter,appendTrack,addBreak,removeItem,moveItem,resolveNext,resolvePrevious,totalDurationSeconds,formatDuration} from './setlist.js?v=2';
import {AudioEngine} from './audio.js?v=2';
import {TrackService,emptyTrackDraft,searchTracks,searchLibraryTracks,hasCompleteStemSet} from './track-service.js?v=5';
import {ModelAssetService} from './model-asset-service.js?v=1';
import {StemSeparationService} from './stem-separation-service.js?v=1';
import {exportSetlistPackage,importSetlistPackage} from './liveset-package.js?v=1';
import {parseCifra} from './cifra.js?v=1';
import {chordDiagramSvg} from './chords.js?v=1';
import {advanceCifraScroll} from './cifra-scroll.js?v=1';

const app=document.querySelector('#app');
const engine=new AudioEngine();
const trackService=new TrackService();
const modelAssets=new ModelAssetService();
const separationService=new StemSeparationService({modelAssets,trackService});
const objectUrls=new Map();
let tracks=[];
let sets=[];
let saved=null;
let working=newSetlist('Friday Night');
let drawer=false;
let view='performance';
let storageState={ready:false,error:null,capabilities:storageCapabilities()};
let pendingInsertAfter=null;
let draggedItemId=null;
let editorDraft=emptyTrackDraft();
let editorMessage='';
let editorError=false;
let setlistPickerOpen=false;
let editorTrackQuery='';
let songSourcePickerOpen=false;
let libraryPickerOpen=false;
let librarySearchQuery='';
let trackControlsOpen=false;
let modelUi={capability:null,state:'checking',progress:0,error:''};
let separationJob=null;
let packageMessage='';
let cifraAnimationFrame=0;
let cifraLastFrame=0;
let cifraScrollPosition=0;
let updateAvailable=false;
let installPrompt=null;
let storageInfo=null;
let activeBreak=null;

const terminalJob=()=>!separationJob||['complete','failed','cancelled'].includes(separationJob.state);
async function refreshModelUi(){modelUi.capability=await modelAssets.getCapability();if(!modelUi.capability.supported){modelUi.state='unsupported';modelUi.error=modelUi.capability.reason;}else{const value=await modelAssets.getModelState();modelUi.state=value.state;modelUi.error=value.error||'';}if(view==='editor')renderEditor();}
separationService.addEventListener('state',async event=>{separationJob=event.detail;if(separationJob.state==='complete'&&separationJob.result?.track){const updated=separationJob.result.track;tracks=[...tracks.filter(track=>track.id!==updated.id),updated];if(editorDraft.sourceKind==='external')editorDraft=await trackService.loadTrackDraft(updated.id);editorMessage='Five synchronized stems generated and committed.';editorError=false;}else if(separationJob.state==='failed'){editorMessage=separationJob.error?.message||separationJob.detail;editorError=true;}else if(separationJob.state==='cancelled'){editorMessage='Stem separation cancelled. No Track or stems were changed.';editorError=false;}if(view==='editor')renderEditor();});

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=seconds=>Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'0:00';
const humanSize=bytes=>bytes?`${(bytes/1024/1024).toFixed(bytes>=10485760?1:2)} MB`:'—';
const activeTrack=()=>tracks.find(track=>track.id===engine.session?.trackId);
const currentDuration=()=>formatDuration(totalDurationSeconds(working,new Map(tracks.map(track=>[track.id,track]))));

async function trackUrl(track){
  if(!objectUrls.has(track.id))objectUrls.set(track.id,await assetUrl(track));
  return objectUrls.get(track.id);
}

function render(){
  const previousScrollTop=document.querySelector('#cifraScroll')?.scrollTop||0;
  if(view==='editor')return renderEditor();
  const playingTrack=activeTrack(),breakView=activeBreak;
  const cifra=playingTrack?.cifraSource,parsed=cifra?parseCifra(cifra):null;
  app.innerHTML=`<div class="app">
    <header class="topbar">
      <button class="btn" id="drawer" aria-label="Open set list">☰</button>
      <div class="brand">LIVESET 1</div>
      <div class="meta"><b>${esc(playingTrack?.title||'Ready')}</b><div class="muted">${esc(working?.name||'No set list')}</div></div>
      <button class="btn track-controls-trigger" id="trackControls" aria-label="Open track controls">☷</button>
    </header>
    <main class="stage"><div class="lyrics">
      <h1>${esc(breakView?breakView.label||'Break':playingTrack?.title||'Performance')}</h1>
      ${breakView?`<div class="break-performance"><strong>${formatDuration(breakView.durationMinutes*60)}</strong><span>Break · playback continues only when you choose Next or Play</span></div>`:''}
      ${playingTrack?.artist?`<p class="performance-artist">${esc(playingTrack.artist)}</p>`:''}
      ${breakView?'':cifra?renderPerformanceCifra(parsed):`<p class="muted">${engine.session?'No cifra saved for this track.':'Choose a song from the set list.'}</p>`}
      ${storageState.error?`<div class="notice" role="status">Local storage unavailable. Saving and importing are unavailable.</div>`:''}
    </div></main>
    <footer class="player">
      <button id="prev" aria-label="Previous song">⏮</button><button id="rew" aria-label="Rewind">↶</button>
      <button id="play" aria-label="Play or pause">${engine.paused?'▶':'Ⅱ'}</button>
      <button id="fwd" aria-label="Fast forward">↷</button><button id="next" aria-label="Next song">⏭</button>
      <span>${fmt(engine.currentTime)} / ${fmt(engine.duration)}</span>
      <div class="progress"><i style="width:${engine.duration?engine.currentTime/engine.duration*100:0}%"></i></div>
    </footer>
    ${drawer?renderDrawer():''}
    ${songSourcePickerOpen?renderSongSourcePicker():''}
    ${libraryPickerOpen?renderLibraryPicker():''}
    ${trackControlsOpen?renderTrackControls(playingTrack):''}
    ${updateAvailable?'<button class="update-notice" id="applyUpdate">Update ready · reload when convenient</button>':''}
    ${installPrompt||(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches)?'<button class="install-notice" id="installApp">INSTALL APP</button>':''}
    ${new URLSearchParams(location.search).has('m3fixture')?`<div class="m3-test-tools"><label class="m3-fixture-seed">SEED FIVE-STEM FIXTURE<input id="stemFixtureFiles" type="file" accept="audio/wav" multiple hidden></label><output id="m3Diagnostics">${esc(m3Diagnostics())}</output></div>`:''}
  </div>`;
  syncDiagnosticDom();
  const area=document.querySelector('#cifraScroll');if(area){area.scrollTop=previousScrollTop;cifraScrollPosition=previousScrollTop;}
  syncCifraAutoScroll();
}

function renderPerformanceCifra(parsed){
  const track=activeTrack(),speed=track?.performance?.cifraScrollSpeed??1,enabled=!!track?.performance?.cifraAutoScrollEnabled;
  const rows=parsed.rows.map(row=>{
    if(row.type==='pair')return `<div class="cifra-row cifra-pair" data-row-chords="${esc(row.chord.chords.join('|'))}"><pre class="cifra-chords">${esc(row.chord.text)}</pre><pre class="cifra-lyrics">${esc(row.lyric.text)}</pre></div>`;
    const line=row.line;return `<div class="cifra-row cifra-${line.type}"><pre>${esc(line.text)}</pre></div>`;
  }).join('');
  const card=chord=>{const svg=chordDiagramSvg(chord);return `<div class="chord-card ${svg?'':'unknown'}" data-chord="${esc(chord)}">${svg||`<strong>${esc(chord)}</strong><span>Diagram unavailable</span>`}</div>`;},split=Math.ceil(parsed.uniqueChords.length/2);
  return `<div class="cifra-scroll-controls"><label class="auto-scroll-toggle"><input id="cifraAutoScrollEnabled" type="checkbox" ${enabled?'checked':''}><span class="toggle-track" aria-hidden="true"><i></i></span><strong>Auto scroll</strong></label><label class="scroll-speed"><span>Speed</span><input id="cifraScrollSpeed" type="range" min="0" max="5" step="0.25" value="${speed}"><output>${Number(speed).toFixed(2)}×</output></label></div><div class="performance-cifra-layout"><aside class="chord-rail chord-rail-left" aria-label="Chord diagrams left">${parsed.uniqueChords.slice(0,split).map(card).join('')}</aside><section class="cifra-scroll" id="cifraScroll" tabindex="0">${rows}</section><aside class="chord-rail chord-rail-right" aria-label="Chord diagrams right">${parsed.uniqueChords.slice(split).map(card).join('')}</aside></div>`;
}

function updateChordHighlight(area){const rows=[...area.querySelectorAll('[data-row-chords]')],current=rows.find(row=>row.offsetTop+row.offsetHeight>=area.scrollTop+24)||rows.at(-1),active=new Set((current?.dataset.rowChords||'').split('|').filter(Boolean));document.querySelectorAll('.chord-card').forEach(card=>card.classList.toggle('current',active.has(card.dataset.chord)));}

function stopCifraScroll(){cifraLastFrame=0;cancelAnimationFrame(cifraAnimationFrame);cifraAnimationFrame=0;}
function syncCifraAutoScroll(){stopCifraScroll();const area=document.querySelector('#cifraScroll');if(area)cifraScrollPosition=area.scrollTop;if(activeTrack()?.performance?.cifraAutoScrollEnabled&&area)cifraAnimationFrame=requestAnimationFrame(runCifraScroll);}
function runCifraScroll(timestamp){
  const area=document.querySelector('#cifraScroll'),track=activeTrack();if(!area||!track?.performance?.cifraAutoScrollEnabled)return stopCifraScroll();
  if(cifraLastFrame){const elapsed=timestamp-cifraLastFrame,speed=track.performance?.cifraScrollSpeed??1;cifraScrollPosition=advanceCifraScroll(cifraScrollPosition,elapsed,speed);area.scrollTop=cifraScrollPosition;if(cifraScrollPosition+area.clientHeight>=area.scrollHeight-1)return stopCifraScroll();}
  cifraLastFrame=timestamp;cifraAnimationFrame=requestAnimationFrame(runCifraScroll);
}

function m3Diagnostics(){const state=engine.snapshot();return JSON.stringify({mode:state.mode,sessionId:state.sessionId,trackId:state.trackId,sourceIdentity:state.sourceIdentity,graphVersion:state.graphVersion,generation:state.playbackGeneration,sourceFrame:state.sourceFrame,consumed:state.consumedFrames,underruns:state.underruns,paused:state.paused,currentTime:Number(state.currentTime.toFixed(3))});}

function renderTrackControls(track){
  const enabled=engine.mode==='stems'&&hasCompleteStemSet(track),performance=track?.performance;
  return `<aside class="track-controls-drawer" aria-label="Track Controls"><div class="drawer-head"><div><h2>Track Controls</h2><span class="track-status ${enabled?'complete':'original'}">${enabled?'STEMS READY':'ORIGINAL'}</span></div><button class="btn" id="closeTrackControls" aria-label="Close track controls">✕</button></div><p class="muted">${enabled?'Five synchronized stems':'Stem controls require a complete valid five-stem Track.'}</p><div class="stem-controls">${STEMS.map(stem=>`<div class="stem-control-row"><strong>${stem[0].toUpperCase()+stem.slice(1)}</strong><button class="stem-toggle mute ${performance?.stemMute?.[stem]?'active':''}" data-stem="${stem}" data-action="mute" ${enabled?'':'disabled'}>M</button><button class="stem-toggle solo ${performance?.stemSolo?.[stem]?'active':''}" data-stem="${stem}" data-action="solo" ${enabled?'':'disabled'}>S</button></div>`).join('')}</div><button class="btn stem-reset" id="resetStemMix" ${enabled?'':'disabled'}>RESET</button></aside>`;
}

function renderDrawer(){
  return `<aside class="drawer">
    <div class="drawer-head"><h2>Set List</h2><button class="btn" id="close" aria-label="Close set list">✕</button></div>
    <div class="toolbar"><button class="btn" id="new">＋ NEW</button>
      <select id="open" aria-label="Open set list"><option value="">OPEN SET LIST…</option>${sets.map(set=>`<option value="${set.id}" ${set.id===working.id?'selected':''}>${esc(set.name)}</option>`).join('')}${sets.some(set=>set.id===working.id)?'':`<option value="${working.id}" selected>${esc(working.name)}</option>`}</select>
      <button class="btn primary" id="save">SAVE</button></div>
    <div class="muted set-summary">${working.items.filter(item=>item.type==='track').length} songs · ${working.items.length} items · ${currentDuration()}</div>
    ${storageInfo?`<div class="muted storage-summary">Local storage ${storageInfo.persisted?'protected':'browser-managed'} · ${humanSize(storageInfo.available)} available</div>`:''}
    ${working.items.map((item,index)=>item.type==='break'?renderBreak(item):renderTrackRow(item,index)).join('')}
    <div class="actions"><button class="btn" id="addSong">＋ ADD SONG</button><button class="btn" id="addBreak">＋ ADD BREAK</button><button class="btn" id="editor">TRACK EDITOR</button><button class="btn" id="exportPackage">EXPORT .LIVESET</button><button class="btn" id="importPackage">IMPORT .LIVESET</button></div>
    ${packageMessage?`<div class="editor-message" role="status">${esc(packageMessage)}</div>`:''}
    <input id="file" type="file" accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/flac,audio/ogg,audio/*" hidden>
    <input id="packageFile" type="file" accept=".liveset,application/zip" hidden>
  </aside>`;
}

function renderBreak(item){
  return `<div class="row break" draggable="true" data-id="${item.id}"><span class="break-handle" aria-hidden="true">⠿</span><span class="break-label">☕ ${esc(item.label||'Break')}</span><input class="duration" aria-label="Break duration" type="number" min="1" max="120" value="${item.durationMinutes}"><span>min</span><button class="break-song-add plus" aria-label="Add song after break">＋</button><button class="remove" aria-label="Remove break">−</button></div>`;
}

function renderTrackRow(item,index){
  const track=tracks.find(candidate=>candidate.id===item.trackId);
  return `<div class="row ${engine.session?.originatingSetlistItemId===item.id?'active':''}" draggable="true" data-id="${item.id}"><span class="drag-handle">⠿</span><b>${String(index+1).padStart(2,'0')}</b><span>${esc(track?.title||'Missing track')}<small class="row-artist">${esc(track?.artist||track?.originalFilename||'Original audio')}</small></span><button class="play-now">PLAY</button><button class="song-add plus" aria-label="Add song after this song">＋</button><button class="remove" aria-label="Remove song">−</button></div>`;
}

function renderSongSourcePicker(){
  return `<div class="setlist-modal"><div class="setlist-modal-card song-source-card" role="dialog" aria-modal="true" aria-labelledby="song-source-title"><h2 id="song-source-title">Add Song</h2><p class="muted">Choose where the song should come from.</p><div class="song-source-actions"><button class="source-choice" id="addFromDevice"><strong>ADD FROM DEVICE</strong><span>Browse audio on this device</span></button><button class="source-choice" id="addFromLibrary"><strong>ADD FROM LIBRARY</strong><span>Use a Track already saved in LiveSet</span></button></div><div class="setlist-modal-actions"><button class="btn" id="cancelSongSource">Cancel</button></div></div></div>`;
}

function libraryResultsMarkup(){
  const matches=searchLibraryTracks(tracks,librarySearchQuery,50);
  if(!matches.length)return '<p class="library-empty">No saved tracks found.</p>';
  return `${matches.map(track=>{const complete=hasCompleteStemSet(track);return `<button type="button" class="library-result" data-library-track-id="${track.id}"><span class="library-result-copy"><strong>${esc(track.title)}</strong><small>${esc(track.artist||'Unknown artist')}</small></span><span class="track-status ${complete?'complete':'original'}">${complete?'STEMS READY':'ORIGINAL'}</span></button>`}).join('')}${matches.length===50?'<p class="library-empty">Showing the first 50 matches. Refine your search for more.</p>':''}`;
}

function renderLibraryPicker(){
  return `<div class="setlist-modal"><div class="setlist-modal-card library-picker-card" role="dialog" aria-modal="true" aria-labelledby="library-picker-title"><h2 id="library-picker-title">Add From Library</h2><p class="muted">Select a Track already saved in LiveSet.</p><input id="libraryTrackSearch" class="library-search" type="search" autocomplete="off" placeholder="Search title or artist" value="${esc(librarySearchQuery)}"><div id="libraryResults" class="library-results">${libraryResultsMarkup()}</div><div class="setlist-modal-actions"><button class="btn" id="cancelLibraryPicker">Cancel</button></div></div></div>`;
}

function renderEditor(){
  const draft=editorDraft;
  const loaded=tracks.find(track=>track.id===draft.trackId),complete=hasCompleteStemSet(loaded),running=!terminalJob();
  const modelStatus=modelUi.state==='ready'?'Model ready':modelUi.state==='downloading'?`Downloading model… ${Math.round(modelUi.progress*100)}%`:modelUi.state==='unsupported'?modelUi.error:modelUi.state==='error'?modelUi.error:'Model not downloaded';
  app.innerHTML=`<div class="editor-shell">
    <header class="editor-topbar"><button class="btn" id="editorBack">← PERFORMANCE</button><div class="brand">LIVESET 1</div><div><strong>Track Editor / Stem Splitter</strong><span>Prepare an original-audio track</span></div></header>
    <main class="editor-layout">
      <section class="editor-card editor-source">
        <div class="editor-card-head"><div><h2>Import & Prepare</h2><span>Choose an existing LiveSet track or audio from this device.</span></div></div>
        <label class="editor-label" for="existingTrackSearch">Existing LiveSet track</label>
        <input id="existingTrackSearch" class="editor-input track-search-input" type="search" autocomplete="off" placeholder="Search title, artist, or filename" value="${esc(editorTrackQuery)}">
        <div id="trackSearchResults" class="track-search-results" role="listbox" aria-label="Track search results">${trackSearchMarkup()}</div>
        <div class="editor-or">OR</div>
        <label class="editor-pick">CHOOSE SONG<input id="editorFile" type="file" accept=".mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/flac,audio/ogg,audio/*" hidden></label>
        <div class="editor-file-card"><div class="wave-thumb"></div><div><strong>${esc(draft.originalFilename||'No song selected')}</strong><span>${draft.sourceKind?`${humanSize(draft.originalSize)} · ${fmt(draft.durationSeconds)} · Ready`:'Waiting for an audio file or LiveSet track'}</span></div><i class="ready-dot ${draft.sourceKind?'ready':''}"></i></div>
        <div class="editor-card-head stem-heading"><div><h2>Stem Split</h2><span>${esc(modelStatus)}</span></div></div>
        <div class="stem-grid">${['Vocals','Guitar','Bass','Drums','Other'].map(name=>`<div class="stem-card ${complete?'ready':'disabled'}"><strong>${name}</strong><span>${complete?'Ready':running?separationJob.detail:'Not generated'}</span></div>`).join('')}</div>
        ${running?`<div class="split-progress"><progress max="1" value="${separationJob.progress||0}"></progress><span>${esc(separationJob.detail||separationJob.state)}</span></div>`:modelUi.state==='downloading'?`<div class="split-progress"><progress id="modelDownloadProgress" max="1" value="${modelUi.progress}"></progress><span>Downloading and verifying model…</span></div>`:''}
        <div class="editor-actions"><button class="btn" id="editorClear" ${running?'disabled':''}>CLEAR</button>${modelUi.state==='ready'?'':`<button class="btn" id="downloadStemModel" ${modelUi.state==='downloading'||modelUi.state==='unsupported'?'disabled':''}>DOWNLOAD MODEL</button>`}<button class="btn" id="splitStems" ${draft.sourceKind&&modelUi.state==='ready'&&!running?'':'disabled'}>SPLIT STEMS</button>${running?'<button class="btn" id="cancelSplit">CANCEL</button>':''}</div>
      </section>
      <aside class="editor-side">
        <section class="editor-card"><div class="editor-card-head"><div><h2>Track Details</h2><span>Saved locally with the original audio.</span></div></div>
          <label class="editor-label" for="trackName">Song name</label><input class="editor-input draft-field" id="trackName" data-field="title" value="${esc(draft.title)}">
          <label class="editor-label" for="artist">Artist</label><input class="editor-input draft-field" id="artist" data-field="artist" value="${esc(draft.artist)}">
          <label class="editor-label" for="genre">Genre</label><input class="editor-input draft-field" id="genre" data-field="genre" value="${esc(draft.genre)}">
        </section>
        <section class="editor-card cifra-card"><div class="editor-card-head"><div><h2>Cifra / Lyrics</h2><span>Spacing and line breaks are stored exactly as entered.</span></div></div><textarea id="cifra" class="cifra-input draft-field" data-field="cifraSource" placeholder="[Intro]&#10;Am   F   C   G&#10;&#10;[Verse]">${esc(draft.cifraSource)}</textarea></section>
        <section class="editor-card editor-save"><button class="save-btn" id="saveTrack" ${draft.sourceKind?'':'disabled'}>SAVE TRACK</button><button class="add-set-btn" id="addTrackToSetlists" ${draft.saved&&draft.trackId?'':'disabled'}>＋ ADD TO SET LIST</button><div class="editor-message ${editorError?'error':''}" role="status">${esc(editorMessage)}</div></section>
      </aside>
    </main>
    ${setlistPickerOpen?renderSetlistPicker():''}
  </div>`;
  syncDiagnosticDom();
}

function trackSearchMarkup(){
  const query=editorTrackQuery.trim();
  if(!query)return '<p class="track-search-hint">Type to search your LiveSet library.</p>';
  const matches=searchTracks(tracks,query,50);
  if(!matches.length)return '<p class="track-search-hint">No tracks found.</p>';
  return `${matches.map(track=>`<button type="button" class="track-search-result ${track.id===editorDraft.trackId?'selected':''}" data-track-id="${track.id}" role="option" aria-selected="${track.id===editorDraft.trackId}"><span><strong>${esc(track.title)}</strong><small>${esc(track.artist||track.originalFilename||'Original audio')}</small></span><em>${fmt(track.durationSeconds)}</em></button>`).join('')}${matches.length===50?'<p class="track-search-hint">Showing the first 50 matches. Refine your search for more.</p>':''}`;
}

function syncDiagnosticDom(){
  const root=app.firstElementChild;
  if(!root)return;
  const snapshot=engine.snapshot();
  root.dataset.engineId=snapshot.engineId;
  root.dataset.graphVersion=String(snapshot.graphVersion);
  root.dataset.sessionId=snapshot.sessionId||'';
  root.dataset.trackId=snapshot.trackId||'';
  root.dataset.sourceIdentity=snapshot.sourceIdentity||'';
  root.dataset.currentTime=String(snapshot.currentTime||0);
  root.dataset.volume=String(snapshot.volume);
  root.dataset.paused=String(snapshot.paused);
  root.dataset.playbackMode=snapshot.mode;
  root.dataset.playbackGeneration=String(snapshot.playbackGeneration??'');
  root.dataset.sourceFrame=String(snapshot.sourceFrame??'');
  root.dataset.underruns=String(snapshot.underruns||0);
}

function renderSetlistPicker(){
  return `<div class="setlist-modal"><div class="setlist-modal-card" role="dialog" aria-modal="true"><h2>Add To Set List</h2><p class="muted">Add a reference to ${esc(editorDraft.title)}.</p><div class="setlist-checks">${sets.map(set=>`<label><input type="checkbox" name="targetSetlist" value="${set.id}"><span>${esc(set.name)}</span></label>`).join('')||'<p class="muted">No saved setlists available.</p>'}</div><div class="setlist-modal-actions"><button class="btn" id="cancelSetlistPicker">Cancel</button><button class="btn primary" id="confirmSetlistPicker" ${sets.length?'':'disabled'}>ADD</button></div></div></div>`;
}

function editorCanDiscard(){return !editorDraft.dirty||confirm('Discard unsaved track changes?');}

function showNewSetlistModal(){
  if(document.querySelector('.setlist-modal'))return;
  const overlay=document.createElement('div');
  overlay.className='setlist-modal';
  overlay.innerHTML='<div class="setlist-modal-card" role="dialog" aria-modal="true"><h2>New Set List</h2><p class="muted">Choose a name for this reusable set list.</p><label for="setlist-name">Set list name</label><input id="setlist-name" type="text" maxlength="80" value="New Set List"><div class="setlist-modal-actions"><button class="btn" data-modal-cancel>Cancel</button><button class="btn primary" data-modal-confirm>CREATE SET LIST</button></div></div>';
  document.body.append(overlay);
  const input=overlay.querySelector('#setlist-name');
  input.focus();input.select();
  const close=()=>overlay.remove();
  overlay.querySelector('[data-modal-cancel]').onclick=close;
  overlay.querySelector('[data-modal-confirm]').onclick=()=>{
    const name=input.value.trim();if(!name)return input.focus();
    if(working&&isDirty(working,saved)&&!confirm('You have unsaved changes to this set list. Discard changes?'))return;
    working=newSetlist(name);saved=clone(working);drawer=true;close();render();
  };
}

async function playItem(itemId){
  const item=working.items.find(candidate=>candidate.id===itemId);
  if(!item||item.type!=='track')return;
  const track=tracks.find(candidate=>candidate.id===item.trackId);
  if(!track)return;
  activeBreak=null;
  const originalUrl=await trackUrl(track);
  const source=hasCompleteStemSet(track)?{mode:'stems',stems:{...track.stems},originalUrl}:{mode:'original',originalUrl};
  const result=await engine.playTrack(track,item.id,source,working.items.map(candidate=>candidate.id));
  if(source.mode==='stems'&&result.mode==='original'){track.stemState='invalid';track.updatedAt=new Date().toISOString();await repository.tracks.put(track);}
  render();
}

async function playResolved(item){if(item?.type==='track')await playItem(item.id);}

app.addEventListener('click',async event=>{
  const button=event.target.closest('button,#drawer,#close,#open,#editor');
  if(!button)return;
  try{
    if(button.id==='drawer'){drawer=true;return render();}
    if(button.id==='close'){drawer=false;return render();}
    if(button.id==='trackControls'){trackControlsOpen=true;return render();}
    if(button.id==='closeTrackControls'){trackControlsOpen=false;return render();}
    if(button.id==='applyUpdate'){navigator.serviceWorker?.controller?.postMessage({type:'SKIP_WAITING'});location.reload();return;}
    if(button.id==='installApp'){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;render();}else alert('On iPad/iPhone: tap Share, then Add to Home Screen.');return;}
    if(button.id==='play'){
      if(activeBreak)return playResolved(resolveNext(working,activeBreak.id,engine.session?.lastKnownOrder||[]));
      if(engine.session)await engine.toggle();
      else await playResolved(working.items.find(item=>item.type==='track'));
      return render();
    }
    if(button.id==='rew'){await engine.seek(-10);return render();}
    if(button.id==='fwd'){await engine.seek(10);return render();}
    if(button.id==='prev')return playResolved(resolvePrevious(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]));
    if(button.id==='next')return playResolved(resolveNext(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]));
    if(button.id==='new')return showNewSetlistModal();
    if(button.id==='save'){
      working.updatedAt=new Date().toISOString();await repository.setlists.put(working);saved=clone(working);sets=[...sets.filter(set=>set.id!==working.id),clone(working)];return render();
    }
    if(button.id==='exportPackage'){
      const persistent=sets.find(set=>set.id===working.id);if(!persistent)throw Error('Save this set list before exporting it.');packageMessage='Creating package…';render();const file=await exportSetlistPackage(persistent);
      const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);packageMessage=`Exported ${file.name}.`;return render();
    }
    if(button.id==='importPackage'){
      if(isDirty(working,saved)&&!confirm('You have unsaved changes to this set list. Importing and opening another set list will discard them.'))return;return document.querySelector('#packageFile').click();
    }
    if(button.id==='addBreak'){addBreak(working);return render();}
    if(button.id==='addSong'){pendingInsertAfter=null;songSourcePickerOpen=true;libraryPickerOpen=false;return render();}
    if(button.classList.contains('song-add')||button.classList.contains('break-song-add')){pendingInsertAfter=button.closest('[data-id]').dataset.id;songSourcePickerOpen=true;libraryPickerOpen=false;return render();}
    if(button.id==='cancelSongSource'){songSourcePickerOpen=false;pendingInsertAfter=null;return render();}
    if(button.id==='addFromDevice'){songSourcePickerOpen=false;render();return document.querySelector('#file').click();}
    if(button.id==='addFromLibrary'){songSourcePickerOpen=false;libraryPickerOpen=true;librarySearchQuery='';return render();}
    if(button.id==='cancelLibraryPicker'){libraryPickerOpen=false;pendingInsertAfter=null;librarySearchQuery='';return render();}
    if(button.classList.contains('library-result')){
      const item=trackItem(button.dataset.libraryTrackId);
      if(pendingInsertAfter)insertAfter(working,pendingInsertAfter,item);else working.items.push(item);
      libraryPickerOpen=false;librarySearchQuery='';pendingInsertAfter=null;return render();
    }
    if(button.classList.contains('remove')){removeItem(working,button.closest('[data-id]').dataset.id);return render();}
    if(button.classList.contains('play-now'))return playItem(button.closest('[data-id]').dataset.id);
    if(button.classList.contains('stem-toggle')){
      const track=activeTrack(),stem=button.dataset.stem,action=button.dataset.action;if(!track||engine.mode!=='stems')return;
      if(action==='mute')engine.setStemMute(stem,!track.performance.stemMute[stem]);else engine.setStemSolo(stem,!track.performance.stemSolo[stem]);
      const persisted=await trackService.saveStemMix(track.id,track.performance.stemMute,track.performance.stemSolo);tracks=tracks.map(candidate=>candidate.id===persisted.id?persisted:candidate);return render();
    }
    if(button.id==='resetStemMix'){
      const track=activeTrack();if(!track||engine.mode!=='stems')return;engine.resetStemMix();const persisted=await trackService.saveStemMix(track.id,track.performance.stemMute,track.performance.stemSolo);tracks=tracks.map(candidate=>candidate.id===persisted.id?persisted:candidate);return render();
    }
    if(button.id==='editor'){view='editor';drawer=false;editorDraft=emptyTrackDraft();editorTrackQuery='';editorMessage='';return render();}
    if(button.id==='editorBack'){if(editorCanDiscard()){view='performance';setlistPickerOpen=false;render();}return;}
    if(button.id==='editorClear'){if(editorCanDiscard()){editorDraft=emptyTrackDraft();editorTrackQuery='';editorMessage='';render();}return;}
    if(button.classList.contains('track-search-result')){
      if(!editorCanDiscard())return;
      editorDraft=await trackService.loadTrackDraft(button.dataset.trackId);
      editorTrackQuery=editorDraft.title;
      editorMessage='';editorError=false;return renderEditor();
    }
    if(button.id==='saveTrack'){
      editorMessage='Saving…';editorError=false;renderEditor();
      const savedTrack=await trackService.saveTrackDraft(editorDraft);
      tracks=[...tracks.filter(track=>track.id!==savedTrack.id),savedTrack];
      editorDraft=await trackService.loadTrackDraft(savedTrack.id);
      editorMessage=`Saved ${savedTrack.title}.`;editorError=false;return renderEditor();
    }
    if(button.id==='downloadStemModel'){
      modelUi.state='downloading';modelUi.progress=0;modelUi.error='';renderEditor();
      await modelAssets.downloadModel(progress=>{modelUi.progress=progress.ratio;const bar=document.querySelector('#modelDownloadProgress');if(bar)bar.value=progress.ratio;});modelUi.state='ready';editorMessage='Separation model verified and available offline.';editorError=false;return renderEditor();
    }
    if(button.id==='splitStems'){
      const existing=tracks.find(track=>track.id===editorDraft.trackId);
      if(hasCompleteStemSet(existing)&&!confirm('Existing stems will be replaced. The original audio will be kept.'))return;
      if(engine.session&&!confirm('Stem separation is resource-intensive and may affect performance while audio is playing. Continue?'))return;
      editorMessage='Starting local WebGPU separation…';editorError=false;renderEditor();
      await separationService.start({trackId:editorDraft.sourceKind==='existing'?editorDraft.trackId:null,file:editorDraft.sourceKind==='external'?editorDraft.file:null,sourceAssetPath:editorDraft.sourceKind==='existing'?existing?.originalAssetPath:null,draft:editorDraft});return;
    }
    if(button.id==='cancelSplit'){separationService.cancel();return;}
    if(button.id==='addTrackToSetlists'){setlistPickerOpen=true;return renderEditor();}
    if(button.id==='cancelSetlistPicker'){setlistPickerOpen=false;return renderEditor();}
    if(button.id==='confirmSetlistPicker'){
      const ids=[...document.querySelectorAll('input[name="targetSetlist"]:checked')].map(input=>input.value);
      if(!ids.length){editorMessage='Select at least one set list.';editorError=true;setlistPickerOpen=false;return renderEditor();}
      const changed=await trackService.addTrackReferencesToSetlists(editorDraft.trackId,ids);
      sets=sets.map(set=>changed.find(candidate=>candidate.id===set.id)||set);
      editorMessage=`Added to ${changed.length} set list${changed.length===1?'':'s'}.`;editorError=false;setlistPickerOpen=false;return renderEditor();
    }
  }catch(error){
    if(view==='editor'){editorMessage=error.message;editorError=true;renderEditor();}
    else{packageMessage=error.message;render();}
  }
});

app.addEventListener('change',async event=>{
  try{
    if(event.target.id==='cifraAutoScrollEnabled'){
      const track=activeTrack();if(!track)return;track.performance.cifraAutoScrollEnabled=event.target.checked;
      const persisted=await trackService.saveCifraScrollSettings(track.id,{speed:track.performance.cifraScrollSpeed,enabled:event.target.checked});tracks=tracks.map(candidate=>candidate.id===persisted.id?persisted:candidate);syncCifraAutoScroll();return;
    }
    if(event.target.id==='cifraScrollSpeed'){
      const track=activeTrack();if(!track)return;const persisted=await trackService.saveCifraScrollSettings(track.id,{speed:Number(event.target.value),enabled:track.performance.cifraAutoScrollEnabled});tracks=tracks.map(candidate=>candidate.id===persisted.id?persisted:candidate);return;
    }
    if(event.target.id==='open'){
      if(!event.target.value)return;
      if(isDirty(working,saved)&&!confirm('You have unsaved changes to this set list. Discard changes?'))return render();
      const selected=sets.find(set=>set.id===event.target.value);if(selected){working=clone(selected);saved=clone(selected);render();}return;
    }
    if(event.target.id==='file'){
      const file=event.target.files[0];if(!file)return;
      const track=await importTrack(file);tracks.push(track);
      if(pendingInsertAfter)insertAfter(working,pendingInsertAfter,trackItem(track.id));else appendTrack(working,track.id);
      pendingInsertAfter=null;return render();
    }
    if(event.target.id==='packageFile'){
      const file=event.target.files[0];if(!file)return;packageMessage='Validating and importing package…';render();const imported=await importSetlistPackage(file);tracks=await trackService.listTracks();sets=await repository.setlists.all();saved=clone(imported.setlist);working=clone(imported.setlist);packageMessage=`Imported ${imported.setlist.name}: ${imported.tracks.length} new, ${imported.reusedTrackCount} reused Tracks.`;return render();
    }
    if(event.target.classList.contains('duration')){
      const item=working.items.find(candidate=>candidate.id===event.target.closest('[data-id]').dataset.id);
      item.durationMinutes=Math.max(1,Math.min(120,Number(event.target.value)||15));return render();
    }
    if(event.target.id==='editorFile'){
      const file=event.target.files[0];if(!file)return;
      if(!editorCanDiscard())return renderEditor();
      editorMessage='Checking audio…';editorError=false;renderEditor();
      editorDraft=await trackService.probeExternalFile(file);editorTrackQuery='';editorMessage='Audio ready. Save Track to store it locally.';return renderEditor();
    }
    if(event.target.id==='stemFixtureFiles'){
      const selected=[...event.target.files],byStem=Object.fromEntries(STEMS.map(stem=>[stem,selected.find(file=>file.name.toLowerCase()===`${stem}.wav`)]));
      const targetItem=working.items.find(item=>item.type==='track'),target=tracks.find(track=>track.id===targetItem?.trackId)||tracks[0];if(!target)throw Error('Import an original Track before seeding stems.');
      await seedStemFixtures(target.id,byStem);return;
    }
  }catch(error){if(view==='editor'){editorMessage=error.message;editorError=true;renderEditor();}else{packageMessage=error.message;render();}}
});

app.addEventListener('input',event=>{
  if(event.target.id==='cifraScrollSpeed'){
    const value=Number(event.target.value),output=event.target.parentElement.querySelector('output');if(output)output.textContent=`${value.toFixed(2)}×`;
    const track=activeTrack();if(track){track.performance.cifraScrollSpeed=value;clearTimeout(event.target._saveTimer);event.target._saveTimer=setTimeout(async()=>{const persisted=await trackService.saveCifraScrollSettings(track.id,{speed:value,enabled:track.performance.cifraAutoScrollEnabled});tracks=tracks.map(candidate=>candidate.id===persisted.id?persisted:candidate);},150);}return;
  }
  if(event.target.id==='libraryTrackSearch'){
    librarySearchQuery=event.target.value;
    const results=document.querySelector('#libraryResults');
    if(results)results.innerHTML=libraryResultsMarkup();
    return;
  }
  if(event.target.id==='existingTrackSearch'){
    editorTrackQuery=event.target.value;
    const results=document.querySelector('#trackSearchResults');
    if(results)results.innerHTML=trackSearchMarkup();
    return;
  }
  if(!event.target.classList.contains('draft-field'))return;
  editorDraft[event.target.dataset.field]=event.target.value;
  editorDraft.dirty=true;
});

app.addEventListener('dragstart',event=>{const row=event.target.closest('.row[draggable="true"]');if(row)draggedItemId=row.dataset.id;});
app.addEventListener('scroll',event=>{if(event.target.id==='cifraScroll')updateChordHighlight(event.target);},true);
app.addEventListener('wheel',event=>{if(event.target.closest?.('#cifraScroll'))cifraScrollPosition=document.querySelector('#cifraScroll').scrollTop;},{passive:true});
app.addEventListener('touchend',event=>{if(event.target.closest?.('#cifraScroll'))cifraScrollPosition=document.querySelector('#cifraScroll').scrollTop;},{passive:true});
app.addEventListener('dragover',event=>{if(event.target.closest('.row[draggable="true"]'))event.preventDefault();});
app.addEventListener('drop',event=>{const row=event.target.closest('.row[draggable="true"]');if(row&&draggedItemId){event.preventDefault();moveItem(working,draggedItemId,working.items.findIndex(item=>item.id===row.dataset.id));render();}});

function updateTransportDom(){
  if(view!=='performance')return;
  const time=document.querySelector('.player>span');
  const progress=document.querySelector('.player .progress i');
  const play=document.querySelector('#play');
  if(time)time.textContent=`${fmt(engine.currentTime)} / ${fmt(engine.duration)}`;
  if(progress)progress.style.width=`${engine.duration?engine.currentTime/engine.duration*100:0}%`;
  if(play)play.textContent=engine.paused?'▶':'Ⅱ';
  syncDiagnosticDom();
  const diagnostics=document.querySelector('#m3Diagnostics');if(diagnostics)diagnostics.textContent=m3Diagnostics();
}

engine.addEventListener('state',updateTransportDom);
engine.addEventListener('ended',()=>{const next=resolveNext(working,engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);if(next?.type==='track')playItem(next.id);else if(next?.type==='break'){activeBreak=next;render();}else render();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;render();});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)){event.preventDefault();document.querySelector('#play')?.click();}});

async function boot(){
  try{
    if(new URLSearchParams(location.search).has('simulateStorageFailure')||!storageState.capabilities.indexedDB)throw Error('Required local storage APIs are unavailable.');
    tracks=await trackService.listTracks();
    sets=await repository.setlists.all();
    if(!sets.length){saved=newSetlist('Friday Night');await repository.setlists.put(saved);sets=[saved];}
    saved=clone(sets[0]);working=clone(saved);storageState.ready=true;
    storageInfo=await storageEstimate();navigator.storage?.persist?.().then(()=>storageEstimate()).then(value=>{storageInfo=value;render();}).catch(()=>{});
  }catch(error){storageState.error=error;storageState.ready=false;saved=clone(working);sets=[];}
  render();
  separationService.cleanupAbandonedJobs().catch(()=>{});refreshModelUi().catch(error=>{modelUi.state='error';modelUi.error=error.message;});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=11').then(registration=>{
    if(registration.waiting)updateAvailable=true;
    registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){updateAvailable=true;render();}});});
  }).catch(()=>{});
}

async function seedStemFixtures(trackId,files){
  const track=tracks.find(candidate=>candidate.id===trackId);if(!track)throw Error('Track not found.');
  const root=await navigator.storage.getDirectory(),liveset=await root.getDirectoryHandle('liveset',{create:true}),trackRoot=await liveset.getDirectoryHandle('tracks',{create:true}),directory=await trackRoot.getDirectoryHandle(trackId,{create:true}),stemDirectory=await directory.getDirectoryHandle('stems',{create:true});
  for(const stem of STEMS){const file=files[stem];if(!file)throw Error(`Missing ${stem} fixture.`);const handle=await stemDirectory.getFileHandle(`${stem}.wav`,{create:true}),writable=await handle.createWritable();await writable.write(file);await writable.close();}
  track.stemState='complete';track.stems=Object.fromEntries(STEMS.map(stem=>[stem,`tracks/${track.id}/stems/${stem}.wav`]));track.updatedAt=new Date().toISOString();await repository.tracks.put(track);render();return structuredClone(track);
}

window.__livesetTest={snapshot:()=>engine.snapshot(),working:()=>structuredClone(working),tracks:()=>structuredClone(tracks),sets:()=>structuredClone(sets),engine,seedStemFixtures};
render();
boot().catch(error=>{storageState.error=error;render();});
