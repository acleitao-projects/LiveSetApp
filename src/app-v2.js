// Query string on each import busts browser + service-worker cache when we push
// changes. Bump BUILD (and search-replace ?v=NN across app-v2.js, song-service.js,
// backup-service.js, and settings-service.js) whenever ANY internal module changes.
// Skipping this bump is what causes stale-icon / stale-module bugs after deploys.
const BUILD='40';
import {repository,storageCapabilities,storageEstimate} from './storage.js?v=40';
import {newSetlist,trackItem,breakItem,uid} from './models.js?v=40';
import {clone,isDirty,insertAfter,appendTrack,addBreak,removeItem,moveItem,resolveNext,resolvePrevious,totalDurationSeconds,formatDuration} from './setlist.js?v=40';
import {AudioEngine} from './audio.js?v=40';
import {pickAndRegisterSong,pickAndRegisterSongs,registerFromInputFile,songUrl,listSongs,saveSongEdits,saveTranspose,saveAudioPitch,saveScrollSettings,getSong,audioAcceptString} from './song-service.js?v=40';
import {parseCifra} from './cifra.js?v=40';
import {chordDiagramSvg} from './chords.js?v=40';
import {advanceCifraScroll} from './cifra-scroll.js?v=40';
import {transposeChordLine,transposeChordSymbol} from './transpose.js?v=40';
import {icon} from './icons.js?v=40';
import {t,loadLanguage,setLanguage,getLanguage,supportedLanguages} from './i18n.js?v=40';
import {searchCifraClub,fetchCifraFromUrl,cleanClipboardCifra} from './cifraclub-import.js?v=40';
import {track,trackBoot,trackView} from './analytics.js?v=40';
import {loadSettings,saveSetting,clampFontScale,pitchRatioFromSemitones,PITCH_MAX_SEMITONES} from './settings-service.js?v=40';
import {createBackup,backupBlob,restoreBackup,shareSetlist,setlistBlob,importSetlistShare} from './backup-service.js?v=40';

const app=document.querySelector('#app');
const engine=new AudioEngine();

// State
let songs=[];
let sets=[];
let working=newSetlist('Friday Night');
let saved=null;
let drawerOpen=false;
let fullscreen=false;
let editSheet=null;   // {songId, title, artist, cifra}
let activeBreak=null;
let statusMessage='';
let statusError=false;
let newSetModalOpen=false;
let storageError=null;
let updateAvailable=false;
let cifraScrollPos=0;
let cifraRaf=0;
let cifraLastFrame=0;
let pendingInsertAfter=null;
let lastRenderedSongId=null;
let installPrompt=null;
let installed=false;
let cifraClubSearch=null; // {artist, query, loading, results, error}
let settingsSheetOpen=false;
let drawerMoreOpen=false;
let onboardingStep=null; // null | 0..4
let previousDrawerOpen=false;
let previousEditSheet=false;
let previousSettingsOpen=false;
let fontScale=1.0;
let muted=false;
let wakeLockSentinel=null;
let backupInputEl=null;
let shareInputEl=null;
let swRegistration=null;
let reloadingForUpdate=false;
let breakTimer=null;      // {itemId,endsAt}
let breakIntervalId=0;
let undoStack=[];         // stack of previous working.items snapshots
let redoStack=[];
let songPickerOpen=false;
let songPickerQuery='';
let dragState=null;       // pointer-driven set list reorder in progress
let dragScrollRaf=0;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=s=>Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00';
const activeSong=()=>songs.find(s=>s.id===engine.session?.songId);
const songById=id=>songs.find(s=>s.id===id);
const workingItemIds=()=>working.items.map(i=>i.id);

let statusTimer=0;
// ---------- Wake lock ----------
async function acquireWakeLock(){
  if(!('wakeLock'in navigator))return;
  if(wakeLockSentinel)return;
  try{
    wakeLockSentinel=await navigator.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release',()=>{wakeLockSentinel=null;});
  }catch(_){/* denied or unsupported — silent */}
}
async function releaseWakeLock(){
  if(!wakeLockSentinel)return;
  try{await wakeLockSentinel.release();}catch(_){}
  wakeLockSentinel=null;
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&engine.session&&!engine.paused)acquireWakeLock();
  else if(document.visibilityState!=='visible')releaseWakeLock();
});

function setStatus(msg,error=false){
  statusMessage=msg;statusError=!!error;
  clearTimeout(statusTimer);
  if(msg){
    const ttl=error?6500:3500;
    statusTimer=setTimeout(()=>{statusMessage='';statusError=false;render();},ttl);
  }
}

// ---------- Rendering ----------

function render(){
  if(dragState)return; // a pointer reorder is live-editing the drawer DOM directly; endDrag() re-renders once it settles
  const song=activeSong();
  const currentSongId=song?.id||null;
  const songChanged=currentSongId!==lastRenderedSongId;
  const prevScroll=songChanged?0:(document.querySelector('#cifraScroll')?.scrollTop||0);
  lastRenderedSongId=currentSongId;
  // Skip slide/fade animations when the surface was already visible on the previous
  // render — otherwise mutations like reorder cause a jarring re-open flash.
  const drawerAnimClass=drawerOpen&&previousDrawerOpen?' no-anim':'';
  const sheetAnimClass=editSheet&&previousEditSheet?' no-anim':'';
  const settingsAnimClass=settingsSheetOpen&&previousSettingsOpen?' no-anim':'';
  previousDrawerOpen=drawerOpen;
  previousEditSheet=!!editSheet;
  previousSettingsOpen=settingsSheetOpen;
  render.drawerAnim=drawerAnimClass;
  render.sheetAnim=sheetAnimClass;
  render.settingsAnim=settingsAnimClass;
  const parsed=song?.cifraSource?parseCifra(song.cifraSource):null;
  const transposed=parsed?applyTranspose(parsed,song.transposeSemitones||0):null;
  const nextItem=resolveNext(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);
  const nextSong=nextItem?.type==='track'?songById(nextItem.songId):null;

  app.className=fullscreen?'fs':'';
  app.innerHTML=`
    ${!fullscreen?renderTopbar():''}
    ${!fullscreen?renderSongHeader(song,nextSong,nextItem):''}
    <main class="stage">
      ${activeBreak?renderBreakScreen(activeBreak):`
      <div class="performance-body">
        ${transposed?renderChordRail(transposed,'left'):'<div></div>'}
        ${renderCifra(song,transposed)}
        ${transposed?renderChordRail(transposed,'right'):'<div></div>'}
      </div>
      `}
      ${''/* rails share the full uniqueChords list; on wide screens each becomes a 2-col grid so all chords are visible on both sides */}
    </main>
    ${!fullscreen?renderControlStrip(song):''}
    ${fullscreen?renderFullscreenControls():''}
    ${drawerOpen?renderDrawer():''}
    ${editSheet?renderEditSheet():''}
    ${cifraClubSearch?renderCifraClubModal():''}
    ${songPickerOpen?renderSongPickerModal():''}
    ${newSetModalOpen?renderNewSetModal():''}
    ${settingsSheetOpen?renderSettingsSheet():''}
    ${onboardingStep!==null?renderOnboarding():''}
    ${storageError?`<div class="notice" role="status">${esc(t('storage_unavailable'))}</div>`:''}
    ${updateAvailable?`<button class="btn small" id="applyUpdate" style="position:fixed;bottom:14px;left:14px;z-index:5">${esc(t('update_ready'))}</button>`:''}
    ${statusMessage?`<div class="notice" role="status" style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:5;max-width:min(520px,90vw);text-align:center">${statusError?'⚠ ':''}${esc(statusMessage)}</div>`:''}
  `;
  syncDiagnostics();
  const area=document.querySelector('#cifraScroll');
  if(area){area.scrollTop=prevScroll;cifraScrollPos=prevScroll;}
  syncCifraAutoScroll();
}

function renderTopbar(){
  return `<header class="topbar">
    <button class="btn icon ghost" id="openDrawer" aria-label="${esc(t('open_set_list_aria'))}">${icon('menu')}</button>
    <div class="brand"><img src="./logo.svg?v=1" alt="LiveSet 1"></div>
    <button class="btn icon ghost" id="fullscreenToggle" aria-label="${esc(t('fullscreen'))}">${icon('fullscreen')}</button>
  </header>`;
}

function renderSongHeader(song,nextSong,nextItem){
  if(activeBreak){
    return `<div class="song-header"><div class="title"><h1>${esc(activeBreak.label||t('break'))}</h1><div class="artist">${activeBreak.durationMinutes} ${t('min')} · ${t('break_continue')}</div></div></div>`;
  }
  const hasNotes=!!(song?.notes&&song.notes.trim());
  return `<div class="song-header">
    <div class="title">
      <h1>${esc(song?.title||t('ready'))}${hasNotes?`<button class="notes-badge" id="showNotes" aria-label="${esc(t('song_notes'))}" title="${esc(song.notes)}">${icon('note')||'★'}</button>`:''}</h1>
      ${song?.artist?`<div class="artist">${esc(song.artist)}</div>`:song?`<div class="artist">${esc(song.originalFilename||'')}</div>`:`<div class="artist">${esc(t('open_set_list_hint'))}</div>`}
    </div>
    ${nextSong||nextItem?.type==='break'?`<button class="next-chip" id="playNext"><span class="label">${esc(t('next'))}</span><strong>${esc(nextSong?nextSong.title:(nextItem?.label||t('break')))}</strong>${icon('chevronRight')}</button>`:''}
  </div>`;
}

function applyTranspose(parsed,semitones){
  if(!semitones)return parsed;
  const rows=parsed.rows.map(row=>{
    if(row.type==='pair'){
      const text=transposeChordLine(row.chord.text,semitones);
      const chords=row.chord.chords.map(c=>transposeChordSymbol(c,semitones));
      return {...row,chord:{...row.chord,text,chords}};
    }
    if(row.type==='chords'){
      const line=row.line;
      return {...row,line:{...line,text:transposeChordLine(line.text,semitones),chords:line.chords.map(c=>transposeChordSymbol(c,semitones))}};
    }
    return row;
  });
  const uniqueChords=parsed.uniqueChords.map(c=>transposeChordSymbol(c,semitones));
  return {...parsed,rows,uniqueChords};
}

function renderCifra(song,parsed){
  if(!song)return `<section class="cifra-scroll" id="cifraScroll"><div class="cifra-empty">${renderBigTransport()}<p class="cifra-empty-hint">${esc(t('choose_song_hint'))}</p></div></section>`;
  if(!parsed)return `<section class="cifra-scroll" id="cifraScroll"><div class="cifra-empty">${renderBigTransport()}<p class="cifra-empty-hint"><strong>${esc(t('no_cifra_title'))}</strong> · ${esc(t('no_cifra_hint'))}</p></div></section>`;
  const rows=parsed.rows.map(row=>{
    if(row.type==='pair')return `<div class="cifra-row cifra-pair" data-row-chords="${esc(row.chord.chords.join('|'))}"><pre class="cifra-chords">${esc(row.chord.text)}</pre><pre class="cifra-lyrics">${esc(row.lyric.text)}</pre></div>`;
    const line=row.line;
    if(line.type==='chords')return `<div class="cifra-row cifra-chords-only" data-row-chords="${esc(line.chords.join('|'))}"><pre class="cifra-chords">${esc(line.text)}</pre></div>`;
    return `<div class="cifra-row cifra-${line.type}"><pre>${esc(line.text)}</pre></div>`;
  }).join('');
  return `<section class="cifra-scroll" id="cifraScroll" tabindex="0">${rows}</section>`;
}

function renderBreakScreen(item){
  const remaining=breakRemainingSeconds();
  return `<div class="break-screen">
    <div class="break-label">${esc(item.label||t('break'))}</div>
    <div class="break-countdown${remaining<=0?' zero':''}" id="breakCountdown">${fmtTime(remaining)}</div>
    <p class="break-hint">${esc(t('break_continue'))}</p>
  </div>`;
}

function renderBigTransport(){
  const paused=engine.paused||!engine.session;
  return `<div class="big-transport" role="group" aria-label="${esc(t('play'))}">
    <button class="big-tp" id="prev" aria-label="${esc(t('previous_song'))}">${icon('prev')}</button>
    <button class="big-tp big-tp-play" id="playPause" aria-label="${esc(paused?t('play'):t('pause'))}">${paused?icon('play'):icon('pause')}</button>
    <button class="big-tp" id="next" aria-label="${esc(t('next_song'))}">${icon('next')}</button>
  </div>`;
}

function renderChordRail(parsed,side){
  const cards=parsed.uniqueChords.map(chord=>{
    const svg=chordDiagramSvg(chord);
    return `<div class="chord-card ${svg?'':'unknown'}" data-chord="${esc(chord)}">${svg||`<strong>${esc(chord)}</strong><span>No diagram</span>`}</div>`;
  }).join('');
  return `<aside class="chord-rail chord-rail-${side}" aria-label="Chord diagrams">${cards}</aside>`;
}

function renderAudioPitch(song){
  const value=song?.audioPitchSemitones||0;
  const active=value!==0;
  return `<div class="transpose audio-pitch ${active?'active':''}" role="group" aria-label="${esc(t('audio_pitch_group'))}" title="${esc(t('audio_pitch_group'))}">
    <span class="glyph" aria-hidden="true">♪</span>
    <button id="audioPitchDown" ${song?'':'disabled'} aria-label="${esc(t('audio_pitch_down'))}">−</button>
    <span class="value">${value>0?'+':''}${value}</span>
    <button id="audioPitchUp" ${song?'':'disabled'} aria-label="${esc(t('audio_pitch_up'))}">+</button>
  </div>`;
}

function renderControlStrip(song){
  const transpose=song?.transposeSemitones||0;
  const speed=song?.cifraScrollSpeed??1;
  const autoOn=!!song?.cifraAutoScrollEnabled;
  const paused=engine.paused||!engine.session;
  const dur=engine.duration||0;
  const cur=engine.currentTime||0;
  const pct=dur?(cur/dur*100):0;
  return `<footer class="control-strip">
    <div class="control-group left">
      <div class="transpose" role="group" aria-label="${esc(t('transpose_group'))}" title="${esc(t('transpose_group'))}">
        <span class="glyph" aria-hidden="true">T</span>
        <button id="transposeDown" ${song?'':'disabled'} aria-label="${esc(t('transpose_down'))}">−</button>
        <span class="value">${transpose>0?'+':''}${transpose}</span>
        <button id="transposeUp" ${song?'':'disabled'} aria-label="${esc(t('transpose_up'))}">+</button>
      </div>
      ${renderAudioPitch(song)}
      <button class="tp-btn mute-btn ${muted?'active':''}" id="muteToggle" aria-pressed="${muted}" aria-label="${esc(muted?t('unmute'):t('mute'))}" title="${esc(muted?t('unmute'):t('mute'))}">${icon(muted?'volumeX':'volume')}</button>
    </div>
    <div class="control-group transport">
      <button class="tp-btn" id="prev" aria-label="${esc(t('previous_song'))}">${icon('prev')}</button>
      <button class="tp-btn" id="rew" aria-label="${esc(t('rewind_10'))}">${icon('rew')}</button>
      <button class="tp-btn play" id="playPause" aria-label="${esc(paused?t('play'):t('pause'))}">${paused?icon('play'):icon('pause')}</button>
      <button class="tp-btn" id="fwd" aria-label="${esc(t('forward_10'))}">${icon('fwd')}</button>
      <button class="tp-btn" id="next" aria-label="${esc(t('next_song'))}">${icon('next')}</button>
    </div>
    <div class="control-group right">
      <div class="scroll-controls">
        <label class="toggle"><input type="checkbox" id="autoScroll" ${autoOn?'checked':''} ${song?'':'disabled'}><span class="track"><i></i></span>${esc(t('auto'))}</label>
        <label class="speed"><input type="range" id="scrollSpeed" min="0" max="5" step="0.25" value="${speed}" ${song?'':'disabled'}><output>${Number(speed).toFixed(2)}×</output></label>
      </div>
    </div>
    ${engine.session?`<div class="time-progress" style="grid-column:1/-1"><span class="time">${fmtTime(cur)} / ${fmtTime(dur)}</span><div class="bar" id="seekBar"><i style="width:${pct}%"></i></div></div>`:''}
  </footer>`;
}

function renderFullscreenControls(){
  const paused=engine.paused||!engine.session;
  return `<button class="fs-exit" id="fullscreenExit" aria-label="${esc(t('exit_fullscreen'))}">${icon('fullscreenExit')}</button>
    <button class="fs-mute ${muted?'active':''}" id="muteToggle" aria-pressed="${muted}" aria-label="${esc(muted?t('unmute'):t('mute'))}" title="${esc(muted?t('unmute'):t('mute'))}">${icon(muted?'volumeX':'volume')}</button>
    <button class="fs-play" id="playPause" aria-label="${esc(paused?t('play'):t('pause'))}">${paused?icon('play'):icon('pause')}</button>`;
}

function renderDrawer(){
  const dur=totalDurationSeconds(working,new Map(songs.map(s=>[s.id,s])));
  const dirty=isDirty(working,saved);
  const lang=getLanguage();
  const showInstall=!installed&&(installPrompt||(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches));
  const anim=render.drawerAnim||'';
  const autoAdvanceOn=working.autoAdvance!==false;
  return `<div class="drawer-scrim${anim}" id="drawerScrim"></div>
  <aside class="drawer${anim}">
    <div class="drawer-head">
      <h2>${esc(t('set_list'))}</h2>
      <button class="btn icon ghost" id="closeDrawer" aria-label="${esc(t('close_set_list'))}">${icon('close')}</button>
    </div>
    <div class="drawer-controls">
      <label class="auto-advance-toggle" title="${esc(t('auto_advance_hint'))}">
        <input type="checkbox" id="autoAdvanceToggle" ${autoAdvanceOn?'checked':''}>
        <span class="track"><i></i></span>
        <span>${esc(t('auto_advance'))}</span>
      </label>
      <div class="undo-redo-group" role="group" aria-label="${esc(t('undo_redo_aria'))}">
        <button class="icon-btn" id="undoAction" ${undoStack.length?'':'disabled'} aria-label="${esc(t('undo'))}" title="${esc(t('undo'))}">${icon('undo')}</button>
        <button class="icon-btn" id="redoAction" ${redoStack.length?'':'disabled'} aria-label="${esc(t('redo'))}" title="${esc(t('redo'))}">${icon('redo')}</button>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn small" id="newSet">${icon('plus')}${esc(t('new'))}</button>
      <select class="setlist-open" id="openSet" aria-label="${esc(t('open_set_list_aria'))}">
        <option value="">${esc(t('open_set_list'))}</option>
        ${sets.map(s=>`<option value="${s.id}" ${s.id===working.id?'selected':''}>${esc(s.name)}</option>`).join('')}
        ${sets.some(s=>s.id===working.id)?'':`<option value="${working.id}" selected>${esc(working.name)} ${esc(t('unsaved_suffix'))}</option>`}
      </select>
      <button class="btn small primary" id="saveSet" ${dirty?'':'disabled'}>${icon('save')}${esc(t('save'))}</button>
    </div>
    <div class="summary">${working.items.filter(i=>i.type==='track').length} ${t('songs')} · ${working.items.length} ${t('items')} · ${formatDuration(dur)}${dirty?' · '+t('unsaved'):''}</div>
    <div class="drawer-list">
      ${working.items.length?working.items.map((item,i)=>item.type==='break'?renderBreakRow(item):renderTrackRow(item,i)).join(''):`<div class="empty">${icon('music')}<h3>${esc(t('empty_setlist_title'))}</h3><p>${esc(t('empty_setlist_hint'))}</p></div>`}
    </div>
    <div class="drawer-actions">
      <button class="btn" id="addSong">${icon('plus')}${esc(t('add_song'))}</button>
      <button class="btn" id="addBreak">${icon('coffee')}${esc(t('add_break'))}</button>
    </div>
    <div class="drawer-actions secondary">
      <button class="btn small" id="duplicateSet" title="${esc(t('duplicate_setlist'))}">${icon('copy')}${esc(t('duplicate'))}</button>
      <button class="btn small" id="shareSet" title="${esc(navigator.share?t('share_setlist_native'):t('share_setlist'))}">${icon('share')}${esc(t('share'))}</button>
      <button class="btn small" id="importShare" title="${esc(t('import_setlist_share'))}">${icon('upload')}${esc(t('import_share'))}</button>
    </div>
    <div class="drawer-foot">
      <div class="lang-toggle" role="group" aria-label="${esc(t('language'))}">
        ${supportedLanguages().map(code=>`<button class="lang-chip ${code===lang?'active':''}" data-lang="${code}">${code.toUpperCase()}</button>`).join('')}
      </div>
      <div class="drawer-foot-actions">
        <div class="drawer-more phone-only" style="position:relative">
          <button class="btn icon ghost" id="openDrawerMore" aria-label="${esc(t('more'))}" title="${esc(t('more'))}" aria-expanded="${drawerMoreOpen}">${icon('moreVertical')}</button>
          ${drawerMoreOpen?`<div class="drawer-more-menu" role="menu">
            <button role="menuitem" class="drawer-more-item" id="duplicateSet">${icon('copy')}<span>${esc(t('duplicate'))}</span></button>
            <button role="menuitem" class="drawer-more-item" id="shareSet">${icon('share')}<span>${esc(t('share'))}</span></button>
            <button role="menuitem" class="drawer-more-item" id="importShare">${icon('upload')}<span>${esc(t('import_share'))}</span></button>
          </div>`:''}
        </div>
        <button class="btn icon ghost" id="openSettings" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${icon('gear')}</button>
        ${showInstall?`<button class="btn small install-btn" id="installApp">${icon('save')}${esc(t('install'))}</button>`:''}
      </div>
    </div>
  </aside>`;
}

function renderTrackRow(item,index){
  const song=songById(item.songId);
  const isActive=engine.session?.originatingSetlistItemId===item.id||activeBreak?.id===item.id;
  const trackNum=String(working.items.slice(0,index+1).filter(i=>i.type==='track').length).padStart(2,'0');
  return `<div class="row track ${isActive?'active':''}" data-id="${item.id}" data-play="${item.id}">
    <button class="drag" aria-label="${esc(t('drag_to_reorder'))}">${icon('drag')}</button>
    <span class="num">${trackNum}</span>
    <div class="body">
      <strong>${esc(song?.title||t('missing_song'))}</strong>
      <small>${esc(song?.artist||song?.originalFilename||t('unknown'))}</small>
    </div>
    <button class="row-action" data-edit-song="${song?.id||''}" ${song?'':'disabled'} aria-label="${esc(t('edit_lyrics'))}">${icon('edit')}</button>
    <button class="row-action danger" data-remove="${item.id}" aria-label="${esc(t('remove_from_set'))}">${icon('remove')}</button>
  </div>`;
}

function renderBreakRow(item){
  return `<div class="row break" data-id="${item.id}">
    <button class="drag" aria-label="${esc(t('drag_to_reorder'))}">${icon('drag')}</button>
    <span class="ic">${icon('coffee')}</span>
    <span class="label">${esc(item.label||t('break'))}</span>
    <input class="dur" type="number" min="1" max="240" value="${item.durationMinutes}" data-break-dur="${item.id}" aria-label="${esc(t('break_duration_aria'))}">
    <span class="unit">${esc(t('min'))}</span>
    <button class="row-action danger" data-remove="${item.id}" aria-label="${esc(t('remove_break'))}">${icon('remove')}</button>
  </div>`;
}

function renderEditSheet(){
  const song=songById(editSheet.songId);
  if(!song)return '';
  const mp3SaveHint=/\.mp3$/i.test(song.originalFilename||'')?t(song.source?.kind==='handle'?'mp3_save_hint_original':'mp3_save_hint_copy'):'';
  const anim=render.sheetAnim||'';
  return `<div class="sheet-scrim${anim}" id="sheetScrim"></div>
  <aside class="sheet${anim}">
    <div class="sheet-head">
      <h2>${esc(t('edit_song'))}</h2>
      <button class="btn icon ghost" id="closeSheet" aria-label="${esc(t('cancel'))}">${icon('close')}</button>
    </div>
    <div class="sheet-body">
      <div class="field"><label for="editTitle">${esc(t('title'))}</label><input id="editTitle" value="${esc(editSheet.title)}"></div>
      <div class="field"><label for="editArtist">${esc(t('artist'))}</label><input id="editArtist" value="${esc(editSheet.artist)}"></div>
      <div class="field"><label for="editNotes">${esc(t('notes'))}</label><textarea id="editNotes" rows="2" placeholder="${esc(t('notes_placeholder'))}">${esc(editSheet.notes||'')}</textarea></div>
      <div class="field" style="flex:1;min-height:280px">
        <label for="editCifra">${esc(t('cifra'))}
          <span class="cifra-import-actions">
            <button class="btn small" id="importCifraClub" hidden>${icon('music')}${esc(t('import_cifraclub'))}</button>
            <button class="btn small" id="importClipboard">${icon('clipboard')}${esc(t('paste_from_clipboard'))}</button>
            <button class="btn small" id="importCifra">${icon('file')}${esc(t('import_txt_cho'))}</button>
          </span>
        </label>
        <textarea id="editCifra" class="cifra-editor" placeholder="[Intro]&#10;Am   F   C   G&#10;&#10;[Verse]&#10;...">${esc(editSheet.cifra)}</textarea>
      </div>
      ${mp3SaveHint?`<p class="mp3-save-hint">${esc(mp3SaveHint)}</p>`:''}
    </div>
    <div class="sheet-actions">
      <button class="btn" id="cancelSheet">${esc(t('cancel'))}</button>
      <button class="btn primary" id="saveSheet">${esc(t('save'))}</button>
    </div>
    <input type="file" id="cifraFile" accept=".txt,.cho,.crd,.chopro,text/plain" hidden>
  </aside>`;
}

function onboardingSteps(){
  const base=[
    {title:t('onboard_welcome_title'),body:t('onboard_welcome_body'),icon:'music'},
    {title:t('onboard_add_title'),body:t('onboard_add_body'),icon:'plus'},
    {title:t('onboard_edit_title'),body:t('onboard_edit_body'),icon:'edit'},
    {title:t('onboard_play_title'),body:t('onboard_play_body'),icon:'play'}
  ];
  const iosStandalone=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches;
  const canInstall=!installed&&(installPrompt||iosStandalone);
  if(canInstall)base.push({title:t('onboard_install_title'),body:iosStandalone?t('onboard_install_body_ios'):t('onboard_install_body'),icon:'download',install:true});
  return base;
}

function renderOnboarding(){
  const steps=onboardingSteps();
  const step=Math.min(onboardingStep??0,steps.length-1);
  const s=steps[step];
  const isLast=step>=steps.length-1;
  const showInstallCta=s.install&&(installPrompt||/iPad|iPhone|iPod/.test(navigator.userAgent));
  return `<div class="modal-scrim">
    <div class="modal onboarding-modal" role="dialog" aria-modal="true">
      <div class="onboarding-icon">${icon(s.icon)}</div>
      <h2>${esc(s.title)}</h2>
      <p class="muted">${esc(s.body)}</p>
      ${showInstallCta?`<button class="btn primary install-btn" id="onboardingInstall" style="width:100%;margin-bottom:14px">${icon('download')}${esc(t('install'))}</button>`:''}
      <div class="onboarding-dots">${steps.map((_,i)=>`<span class="dot ${i===step?'active':''}"></span>`).join('')}</div>
      <div class="modal-actions">
        <button class="btn ghost" id="onboardingSkip">${esc(t('skip'))}</button>
        <div style="flex:1"></div>
        ${step>0?`<button class="btn" id="onboardingBack">${esc(t('back'))}</button>`:''}
        <button class="btn primary" id="onboardingNext">${esc(isLast?t('get_started'):t('next_step'))}</button>
      </div>
    </div>
  </div>`;
}

function renderSettingsSheet(){
  const scalePct=Math.round(fontScale*100);
  return `<div class="modal-scrim" id="settingsScrim">
    <div class="modal cc-modal" role="dialog" aria-modal="true">
      <h2>${esc(t('settings'))}</h2>
      <div class="field">
        <label>${esc(t('font_size'))} <span class="muted">${scalePct}%</span></label>
        <div class="font-scale-row">
          <button class="btn" id="fontScaleDown" aria-label="${esc(t('font_smaller'))}">A−</button>
          <div class="font-scale-preview" style="font-size:${(fontScale*17).toFixed(2)}px">Am  F  C  G</div>
          <button class="btn" id="fontScaleUp" aria-label="${esc(t('font_larger'))}">A+</button>
        </div>
      </div>
      <div class="field">
        <label>${esc(t('backup_section'))}</label>
        <div class="settings-btn-row">
          <button class="btn" id="backupExport">${icon('download')}${esc(t('backup_export'))}</button>
          <button class="btn" id="backupImport">${icon('upload')}${esc(t('backup_import'))}</button>
        </div>
        <p class="muted" style="margin:6px 0 0;font-size:12px;line-height:1.4">${esc(t('backup_hint'))}</p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" id="closeSettings">${esc(t('done'))}</button>
      </div>
    </div>
  </div>`;
}

function renderCifraClubModal(){
  const s=cifraClubSearch;
  const listItems=(s.results||[]).slice(0,30).map((r,i)=>`<button type="button" class="cc-result" data-cc-url="${esc(r.url)}"><strong>${esc(r.title)}</strong><small>${esc(r.artist||'')}</small></button>`).join('');
  return `<div class="modal-scrim" id="ccScrim">
    <div class="modal cc-modal" role="dialog" aria-modal="true">
      <h2>${esc(t('cifraclub_title'))}</h2>
      <p class="muted">${esc(t('cifraclub_hint'))}</p>
      <div class="field"><label for="ccArtist">${esc(t('cifraclub_artist_label'))}</label><input id="ccArtist" value="${esc(s.artist||'')}" autocomplete="off"></div>
      <div class="field"><label for="ccQuery">${esc(t('cifraclub_song_label'))}</label><input id="ccQuery" value="${esc(s.query||'')}" autocomplete="off"></div>
      <div class="modal-actions">
        <button class="btn" id="ccCancel">${esc(t('cancel'))}</button>
        <button class="btn primary" id="ccSearch" ${s.loading?'disabled':''}>${s.loading?esc(t('cifraclub_searching')):esc(t('cifraclub_search'))}</button>
      </div>
      ${s.error?`<div class="notice" style="margin-top:12px">${esc(s.error)}</div>`:''}
      ${listItems?`<div class="cc-results">${listItems}</div>`:''}
    </div>
  </div>`;
}

function songPickerResultsHtml(){
  const q=songPickerQuery.trim().toLowerCase();
  const list=songs
    .filter(s=>!q||s.title.toLowerCase().includes(q)||(s.artist||'').toLowerCase().includes(q)||(s.originalFilename||'').toLowerCase().includes(q))
    .sort((a,b)=>a.title.localeCompare(b.title));
  const items=list.map(s=>`<button type="button" class="cc-result" data-pick-song="${s.id}"><strong>${esc(s.title)}</strong><small>${esc(s.artist||s.originalFilename||t('unknown'))}</small></button>`).join('');
  return items?`<div class="cc-results">${items}</div>`:`<p class="muted" style="margin-top:16px">${esc(t('no_matching_songs'))}</p>`;
}

function renderSongPickerModal(){
  return `<div class="modal-scrim" id="songPickerScrim">
    <div class="modal cc-modal" role="dialog" aria-modal="true">
      <h2>${esc(t('add_song'))}</h2>
      <div class="field"><label for="songPickerSearch">${esc(t('search_library'))}</label><input id="songPickerSearch" value="${esc(songPickerQuery)}" placeholder="${esc(t('search_library_placeholder'))}" autocomplete="off" autofocus></div>
      <div class="modal-actions" style="margin-top:0">
        <button class="btn" id="songPickerCancel">${esc(t('cancel'))}</button>
        <button class="btn primary" id="songPickerNewFile">${icon('plus')}${esc(t('pick_new_file'))}</button>
      </div>
      <div id="songPickerResults">${songPickerResultsHtml()}</div>
    </div>
  </div>`;
}

function renderNewSetModal(){
  return `<div class="modal-scrim" id="newSetScrim">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(t('new_set_list'))}</h2>
      <p class="muted">${esc(t('give_name_hint'))}</p>
      <div class="field"><label for="newSetName">${esc(t('name'))}</label><input id="newSetName" value="${esc(t('default_new_set_name'))}" maxlength="80" autofocus></div>
      <div class="modal-actions">
        <button class="btn" id="cancelNewSet">${esc(t('cancel'))}</button>
        <button class="btn primary" id="confirmNewSet">${esc(t('create'))}</button>
      </div>
    </div>
  </div>`;
}

function syncDiagnostics(){
  const root=app;
  if(!root)return;
  const snap=engine.snapshot();
  root.dataset.engineId=snap.engineId;
  root.dataset.graphVersion=String(snap.graphVersion);
  root.dataset.sessionId=snap.sessionId||'';
  root.dataset.songId=snap.songId||'';
  root.dataset.currentTime=String(snap.currentTime||0);
  root.dataset.paused=String(snap.paused);
}

// ---------- Auto-scroll ----------

function stopAutoScroll(){cancelAnimationFrame(cifraRaf);cifraRaf=0;cifraLastFrame=0;}
function autoScrollShouldRun(){
  const song=activeSong();
  return !!(song?.cifraAutoScrollEnabled&&engine.session&&!engine.paused);
}
function syncCifraAutoScroll(){
  stopAutoScroll();
  const area=document.querySelector('#cifraScroll');
  if(area)cifraScrollPos=area.scrollTop;
  if(autoScrollShouldRun()&&area)cifraRaf=requestAnimationFrame(runAutoScroll);
}
function runAutoScroll(ts){
  const area=document.querySelector('#cifraScroll');
  if(!area||!autoScrollShouldRun())return stopAutoScroll();
  const song=activeSong();
  if(cifraLastFrame){
    const speed=song.cifraScrollSpeed??1;
    cifraScrollPos=advanceCifraScroll(cifraScrollPos,ts-cifraLastFrame,speed);
    area.scrollTop=cifraScrollPos;
    if(cifraScrollPos+area.clientHeight>=area.scrollHeight-1)return stopAutoScroll();
  }
  cifraLastFrame=ts;
  cifraRaf=requestAnimationFrame(runAutoScroll);
}

function updateChordHighlight(area){
  const rows=[...area.querySelectorAll('[data-row-chords]')];
  const current=rows.find(r=>r.offsetTop+r.offsetHeight>=area.scrollTop+24)||rows.at(-1);
  const active=new Set((current?.dataset.rowChords||'').split('|').filter(Boolean));
  const cardsByRail=new Map();
  document.querySelectorAll('.chord-card').forEach(card=>{
    const isActive=active.has(card.dataset.chord);
    card.classList.toggle('current',isActive);
    if(isActive){
      const rail=card.closest('.chord-rail');
      if(rail&&!cardsByRail.has(rail))cardsByRail.set(rail,card);
    }
  });
  // Keep at least one highlighted card visible per rail. block:'nearest' avoids
  // fighting user scroll and only nudges when the card is actually off-screen.
  cardsByRail.forEach(card=>{
    try{card.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}catch(_){card.scrollIntoView(false);}
  });
}

// ---------- Break countdown timer ----------
// Ticks independently of render() so a full re-render (drawer toggles, status
// messages, etc.) never resets the clock — it's driven purely by wall time.

function breakRemainingSeconds(){
  if(!activeBreak)return 0;
  if(!breakTimer||breakTimer.itemId!==activeBreak.id)return Math.max(0,Math.round((activeBreak.durationMinutes||0)*60));
  return Math.max(0,Math.round((breakTimer.endsAt-Date.now())/1000));
}
function stopBreakTimer(){
  clearInterval(breakIntervalId);
  breakIntervalId=0;
  breakTimer=null;
}
function startBreakTimer(item){
  stopBreakTimer();
  breakTimer={itemId:item.id,endsAt:Date.now()+Math.max(0,item.durationMinutes||0)*60000};
  breakIntervalId=setInterval(tickBreakTimer,250);
  tickBreakTimer();
}
function tickBreakTimer(){
  if(!activeBreak||!breakTimer){stopBreakTimer();return;}
  const el=document.querySelector('#breakCountdown');
  if(!el)return; // break screen not on-screen right now; interval keeps running cheaply
  const remaining=breakRemainingSeconds();
  el.textContent=fmtTime(remaining);
  el.classList.toggle('zero',remaining<=0);
}

// ---------- Playback ----------

async function enterBreak(item){
  activeBreak=item;
  startBreakTimer(item);
  if(engine.session&&!engine.paused)await engine.toggle();
  track('enter_break',{minutes:item.durationMinutes});
  render();
}

async function playItemById(itemId){
  const item=working.items.find(i=>i.id===itemId);
  if(!item)return;
  if(item.type==='break')return enterBreak(item);
  const song=songById(item.songId);
  if(!song){setStatus(t('song_missing_library'),true);render();return;}
  activeBreak=null;
  stopBreakTimer();
  try{
    const url=await songUrl(song);
    const wasSameSong=engine.session?.songId===song.id;
    await engine.playSong(song,item.id,url,workingItemIds());
    engine.updateLastKnownOrder(workingItemIds());
    syncEnginePitch();
    if(!wasSameSong)track('play_song',{has_cifra:!!(song.cifraSource&&song.cifraSource.trim()),transposed:!!song.transposeSemitones,pitched:!!song.audioPitchSemitones,source_kind:song.source?.kind||'unknown'});
    render();
  }catch(error){
    setStatus(error.message||t('playback_failed'),true);
    render();
  }
}

async function playResolved(item){
  if(!item)return;
  if(item.type==='break')return enterBreak(item);
  return playItemById(item.id);
}

async function togglePlay(){
  if(activeBreak){
    const next=resolveNext(working,activeBreak.id,engine.session?.lastKnownOrder||[]);
    if(next){activeBreak=null;stopBreakTimer();return playResolved(next);}
  }
  if(engine.session)await engine.toggle();
  else{
    const first=working.items.find(i=>i.type==='track');
    if(first)await playItemById(first.id);
  }
  render();
}

// ---------- Actions ----------

async function persistTranspose(delta){
  const song=activeSong();
  if(!song)return;
  const next=Math.max(-12,Math.min(12,(song.transposeSemitones||0)+delta));
  const updated=await saveTranspose(song.id,next);
  songs=songs.map(s=>s.id===updated.id?updated:s);
  render();
}

async function persistAudioPitch(delta){
  const song=activeSong();
  if(!song)return;
  const next=Math.max(-PITCH_MAX_SEMITONES,Math.min(PITCH_MAX_SEMITONES,(song.audioPitchSemitones||0)+delta));
  if(next===(song.audioPitchSemitones||0))return;
  const updated=await saveAudioPitch(song.id,next);
  songs=songs.map(s=>s.id===updated.id?updated:s);
  syncEnginePitch();
  render();
}

async function pickSongAndAppend(){
  try{
    const picked=await pickAndRegisterSongs();
    if(!picked||!picked.length)return;
    for(const song of picked){
      if(!songs.find(s=>s.id===song.id))songs=[...songs,song];
      else songs=songs.map(s=>s.id===song.id?song:s);
    }
    pushUndo();
    // Preserve list order: insert all consecutively after pendingInsertAfter
    let anchor=pendingInsertAfter;
    for(const song of picked){
      const item=trackItem(song.id);
      if(anchor){insertAfter(working,anchor,item);anchor=item.id;}
      else appendTrack(working,song.id);
    }
    pendingInsertAfter=null;
    engine.updateLastKnownOrder(workingItemIds());
    setStatus(picked.length===1?t('added_song',{title:picked[0].title}):t('added_songs',{count:picked.length}));
    track(picked.length===1?'import_song':'import_multiple',{count:picked.length});
    render();
  }catch(error){
    if(error?.name==='AbortError')return;
    setStatus(error.message||t('could_not_add'),true);
    render();
  }
}

// ---------- Undo / redo (add / remove / reorder only) ----------

function pushUndo(){
  undoStack.push(clone(working.items));
  if(undoStack.length>50)undoStack.shift();
  redoStack=[];
}
function resetUndoHistory(){undoStack=[];redoStack=[];}
function undoSetlistAction(){
  if(!undoStack.length)return;
  redoStack.push(clone(working.items));
  working.items=undoStack.pop();
  engine.updateLastKnownOrder(workingItemIds());
  setStatus(t('undo_done'));
  track('undo_setlist_action');
  render();
}
function redoSetlistAction(){
  if(!redoStack.length)return;
  undoStack.push(clone(working.items));
  working.items=redoStack.pop();
  engine.updateLastKnownOrder(workingItemIds());
  setStatus(t('redo_done'));
  track('redo_setlist_action');
  render();
}

// ---------- Song picker (search library before falling back to a file) ----------

function openSongPicker(){
  if(!songs.length)return pickSongAndAppend();
  songPickerOpen=true;songPickerQuery='';
  track('song_picker_open');
  render();
}
function closeSongPicker(){songPickerOpen=false;render();}
function appendExistingSong(songId){
  const song=songById(songId);
  if(!song)return;
  pushUndo();
  const item=trackItem(song.id);
  if(pendingInsertAfter)insertAfter(working,pendingInsertAfter,item);
  else appendTrack(working,song.id);
  pendingInsertAfter=null;
  engine.updateLastKnownOrder(workingItemIds());
  songPickerOpen=false;
  setStatus(t('added_song',{title:song.title}));
  track('add_from_library');
  render();
}

// ---------- Clipboard cifra import ----------

async function pasteCifraFromClipboard(){
  if(!editSheet)return;
  try{
    if(!navigator.clipboard?.readText)throw Error('clipboard_unsupported');
    const raw=await navigator.clipboard.readText();
    if(!raw||!raw.trim())throw Error('clipboard_empty');
    if(editSheet.cifra&&editSheet.cifra.trim()&&!confirm(t('cifraclub_replace_confirm')))return;
    editSheet.cifra=cleanClipboardCifra(raw);
    setStatus(t('clipboard_import_ok'));
    track('import_cifra_clipboard_success',{length:editSheet.cifra.length});
    render();
  }catch(error){
    const key=error?.message==='clipboard_unsupported'?'clipboard_unsupported'
      :error?.message==='clipboard_empty'?'clipboard_empty'
      :error?.name==='NotAllowedError'?'clipboard_denied'
      :'clipboard_failed';
    setStatus(t(key),true);
    track('import_cifra_clipboard_error',{code:key});
    render();
  }
}

async function reloadSongs(){
  songs=await listSongs();
}

function openEditSheet(songId){
  const song=songById(songId);
  if(!song)return;
  editSheet={songId,title:song.title,artist:song.artist||'',cifra:song.cifraSource||'',notes:song.notes||''};
  render();
}

const CC_ERROR_MAP={
  missing_url:'cifraclub_missing_url',
  invalid_url:'cifraclub_invalid_url',
  proxy_failed:'cifraclub_proxy_failed',
  no_content:'cifraclub_no_content',
  empty_content:'cifraclub_empty',
  missing_artist:'cifraclub_missing_artist',
  artist_not_found:'cifraclub_artist_not_found',
  not_found:'cifraclub_artist_not_found',
  no_songs:'cifraclub_no_results'
};
function ccErrorMessage(err){return t(CC_ERROR_MAP[err?.message]||'cifraclub_proxy_failed');}

function openCifraClubSearch(){
  if(!editSheet)return;
  cifraClubSearch={
    artist:editSheet.artist||'',
    query:editSheet.title||'',
    loading:false,
    results:[],
    error:''
  };
  render();
}

function applyFontScale(){
  document.documentElement.style.setProperty('--cifra-scale',String(fontScale));
}

function syncEnginePitch(){
  const song=activeSong();
  const semis=song?.audioPitchSemitones||0;
  const ratio=pitchRatioFromSemitones(semis);
  const enabled=semis!==0;
  engine.setPitchRatio(ratio,{enabled}).catch(()=>{});
}

async function adjustFontScale(delta){
  fontScale=clampFontScale(fontScale+delta);
  applyFontScale();
  await saveSetting('fontScale',fontScale);
  track('font_scale_change',{scale:fontScale});
}

async function runDuplicateSet(){
  const copy=clone(working);
  copy.id=uid();
  copy.name=`${working.name} — ${t('copy_suffix')}`;
  copy.items=copy.items.map(item=>({...item,id:uid()}));
  copy.createdAt=copy.updatedAt=new Date().toISOString();
  await repository.setlists.put(copy);
  sets=[...sets.filter(s=>s.id!==copy.id),clone(copy)];
  working=clone(copy);saved=clone(copy);
  resetUndoHistory();
  engine.updateLastKnownOrder(workingItemIds());
  setStatus(t('setlist_duplicated',{name:copy.name}));
  track('duplicate_setlist');
  render();
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
}

async function runShareSet(){
  try{
    const share=shareSetlist(working,songs);
    const filename=`${(working.name||'setlist').replace(/[^\w-]+/g,'_')}.setlist.json`;
    const blob=setlistBlob(share);
    if(navigator.share){
      try{
        const file=new File([blob],filename,{type:'application/json'});
        const shareData=navigator.canShare?.({files:[file]})?{files:[file],title:working.name,text:t('share_setlist_text',{name:working.name})}:{title:working.name,text:t('share_setlist_text',{name:working.name})};
        await navigator.share(shareData);
        setStatus(t('setlist_shared'));track('share_setlist',{tracks:share.songs.length,method:'web_share'});
        return;
      }catch(shareError){
        if(shareError?.name==='AbortError')return; // user dismissed the share sheet
        // Unsupported payload or share failed — fall through to the download.
      }
    }
    downloadBlob(blob,filename);
    setStatus(t('setlist_shared'));track('share_setlist',{tracks:share.songs.length,method:'download'});
  }catch(error){setStatus(error.message||t('share_failed'),true);render();}
}

function triggerShareImport(){
  if(!shareInputEl){
    shareInputEl=document.createElement('input');
    shareInputEl.type='file';shareInputEl.accept='.json,application/json';
    shareInputEl.style.display='none';
    shareInputEl.addEventListener('change',handleShareImport);
    document.body.appendChild(shareInputEl);
  }
  shareInputEl.value='';shareInputEl.click();
}
async function handleShareImport(){
  const file=shareInputEl.files?.[0];if(!file)return;
  try{
    const text=await file.text();
    const share=JSON.parse(text);
    const {setlist,imported}=await importSetlistShare(share);
    if(isDirty(working,saved)&&!confirm(t('discard_confirm')))return;
    setlist.id=uid();setlist.items=setlist.items.map(i=>({...i,id:uid()}));
    setlist.createdAt=setlist.updatedAt=new Date().toISOString();
    await repository.setlists.put(setlist);
    sets=await repository.setlists.all();
    songs=await listSongs();
    working=clone(setlist);saved=clone(setlist);
    resetUndoHistory();
    setStatus(t('share_imported',{count:imported}));
    track('import_share',{songs:imported});
    render();
  }catch(error){setStatus(error?.message==='invalid_setlist_share'?t('share_invalid'):(error.message||t('share_failed')),true);render();}
}

async function runBackupExport(){
  try{
    setStatus(t('backup_working'));render();
    const backup=await createBackup();
    const stamp=new Date().toISOString().replace(/[:.]/g,'-').replace(/T/,'_').slice(0,19);
    downloadBlob(backupBlob(backup),`liveset-backup-${stamp}.json`);
    setStatus(t('backup_saved'));
    track('backup_export',{songs:backup.songs.length,setlists:backup.setlists.length,files:Object.keys(backup.files).length});
  }catch(error){setStatus(error.message||t('backup_failed'),true);render();}
}

function triggerBackupImport(){
  if(!backupInputEl){
    backupInputEl=document.createElement('input');
    backupInputEl.type='file';backupInputEl.accept='.json,application/json';
    backupInputEl.style.display='none';
    backupInputEl.addEventListener('change',handleBackupImport);
    document.body.appendChild(backupInputEl);
  }
  backupInputEl.value='';backupInputEl.click();
}
async function handleBackupImport(){
  const file=backupInputEl.files?.[0];if(!file)return;
  try{
    const text=await file.text();
    const backup=JSON.parse(text);
    if(!confirm(t('backup_restore_confirm')))return;
    setStatus(t('backup_restoring'));render();
    const summary=await restoreBackup(backup,{mode:'merge'});
    songs=await listSongs();sets=await repository.setlists.all();
    const restoredSettings=await loadSettings();
    fontScale=restoredSettings.fontScale;applyFontScale();
    if(sets[0]){saved=clone(sets[0]);working=clone(sets[0]);}
    resetUndoHistory();
    setStatus(t('backup_restored',{songs:summary.songs,setlists:summary.setlists,files:summary.files}));
    track('backup_import',{songs:summary.songs,setlists:summary.setlists,files:summary.files});
    render();
  }catch(error){setStatus(error?.message==='invalid_backup'?t('backup_invalid'):(error.message||t('backup_failed')),true);render();}
}

async function finishOnboarding(skipped){
  onboardingStep=null;
  await saveSetting('onboardingCompleted',true);
  track(skipped?'onboarding_skipped':'onboarding_completed');
  render();
}

async function runCifraClubSearch(){
  if(!cifraClubSearch)return;
  const artistInput=document.querySelector('#ccArtist')?.value||'';
  const queryInput=document.querySelector('#ccQuery')?.value||'';
  cifraClubSearch.artist=artistInput;
  cifraClubSearch.query=queryInput;
  cifraClubSearch.results=[];
  cifraClubSearch.error='';
  if(!artistInput.trim()){cifraClubSearch.error=t('cifraclub_missing_artist');return render();}
  cifraClubSearch.loading=true;render();
  try{
    const results=await searchCifraClub({artist:artistInput,query:queryInput});
    cifraClubSearch.results=results;
    if(!results.length)cifraClubSearch.error=t('cifraclub_no_results');
    track('cifraclub_search',{results:results.length,had_query:!!queryInput.trim()});
  }catch(error){
    cifraClubSearch.error=ccErrorMessage(error);
    track('cifraclub_search_error',{code:error?.message||'unknown'});
  }finally{
    cifraClubSearch.loading=false;render();
  }
}

async function pickCifraClubResult(url){
  if(!editSheet)return;
  if(editSheet.cifra&&editSheet.cifra.trim()&&!confirm(t('cifraclub_replace_confirm')))return;
  cifraClubSearch.loading=true;render();
  try{
    const result=await fetchCifraFromUrl(url);
    editSheet.cifra=result.cifra;
    if(!editSheet.title&&result.title)editSheet.title=result.title;
    if(!editSheet.artist&&result.artist)editSheet.artist=result.artist;
    cifraClubSearch=null;
    setStatus(t('cifraclub_ok'));
    track('cifraclub_import_success',{cifra_length:result.cifra.length});
  }catch(error){
    cifraClubSearch.error=ccErrorMessage(error);
    cifraClubSearch.loading=false;
  }
  render();
}

async function saveEditSheet(){
  if(!editSheet)return;
  const {songId,title,artist,cifra}=editSheet;
  try{
    const result=await saveSongEdits(songId,{title,artist,cifra,notes:editSheet.notes},songById(songId));
    const updated=result.song;
    songs=songs.map(s=>s.id===updated.id?updated:s);
    editSheet=null;
    setStatus(t(result.metadataWritten?'song_mp3_saved':'song_saved'));
    track('save_song_edits',{mp3_written:!!result.metadataWritten,cifra_length:(cifra||'').length});
    render();
  }catch(error){
    setStatus(error.message||t('save_failed'),true);
    render();
  }
}

// ---------- Event handlers ----------

app.addEventListener('click',async event=>{
  const target=event.target;

  // Scrim clicks dismiss overlays (checked before the button selector so plain divs work)
  // Close the drawer-more popover on any click outside it
  if(drawerMoreOpen&&!target.closest('.drawer-more')){drawerMoreOpen=false;render();}
  if(target.id==='drawerScrim'){drawerOpen=false;return render();}
  if(target.id==='sheetScrim'){editSheet=null;return render();}
  if(target.id==='newSetScrim'){newSetModalOpen=false;return render();}
  if(target.id==='ccScrim'){cifraClubSearch=null;return render();}
  if(target.id==='settingsScrim'){settingsSheetOpen=false;return render();}
  if(target.id==='songPickerScrim'){return closeSongPicker();}

  // Language chip
  const langBtn=target.closest('.lang-chip[data-lang]');
  if(langBtn){track('language_change',{to:langBtn.dataset.lang});await setLanguage(langBtn.dataset.lang);return render();}

  const btn=target.closest('button,select,label,.row.track,.chord-card');
  if(!btn)return;

  // Playing rows: click anywhere on the row body except drag / actions
  const rowPlay=target.closest('[data-play]');
  if(rowPlay&&!target.closest('.drag,.row-action,input')){
    return playItemById(rowPlay.dataset.play);
  }

  try{
    if(btn.id==='openDrawerMore'){drawerMoreOpen=!drawerMoreOpen;return render();}
    if(btn.id==='openSettings'){settingsSheetOpen=true;drawerMoreOpen=false;track('open_settings');return render();}
    if(btn.id==='closeSettings'){settingsSheetOpen=false;return render();}
    if(btn.id==='fontScaleUp'){await adjustFontScale(0.1);return render();}
    if(btn.id==='fontScaleDown'){await adjustFontScale(-0.1);return render();}
    if(btn.id==='backupExport'){await runBackupExport();return;}
    if(btn.id==='backupImport'){triggerBackupImport();return;}
    if(btn.id==='duplicateSet'){drawerMoreOpen=false;await runDuplicateSet();return;}
    if(btn.id==='shareSet'){drawerMoreOpen=false;await runShareSet();return;}
    if(btn.id==='importShare'){drawerMoreOpen=false;triggerShareImport();return;}
    if(btn.id==='onboardingSkip'){await finishOnboarding(true);return render();}
    if(btn.id==='onboardingNext'){
      const total=onboardingSteps().length;
      onboardingStep=(onboardingStep??0)+1;
      if(onboardingStep>=total)await finishOnboarding(false);
      return render();
    }
    if(btn.id==='onboardingBack'){onboardingStep=Math.max(0,(onboardingStep??0)-1);return render();}
    if(btn.id==='onboardingInstall'){
      track('install_from_onboarding');
      if(installPrompt){
        try{await installPrompt.prompt();const choice=await installPrompt.userChoice;track(choice?.outcome==='accepted'?'install_accepted':'install_declined');if(choice?.outcome==='accepted')installed=true;installPrompt=null;}
        catch(_){/* ignore */}
      }else{alert(t('install_ios_hint'));}
      return render();
    }
    if(btn.id==='openDrawer'){drawerOpen=true;track('open_drawer');return render();}
    if(btn.id==='closeDrawer'){drawerOpen=false;return render();}
    if(btn.id==='fullscreenToggle'){fullscreen=true;track('fullscreen_toggle',{enabled:true});return render();}
    if(btn.id==='fullscreenExit'){fullscreen=false;track('fullscreen_toggle',{enabled:false});return render();}
    if(btn.id==='applyUpdate'){
      track('apply_update');
      const waiting=swRegistration?.waiting||(await navigator.serviceWorker?.getRegistration())?.waiting;
      if(waiting){reloadingForUpdate=true;waiting.postMessage({type:'SKIP_WAITING'});}
      else{location.reload();}
      return;
    }
    if(btn.id==='installApp'){
      if(installPrompt){
        try{
          track('install_prompt_shown');
          await installPrompt.prompt();
          const choice=await installPrompt.userChoice;
          track(choice?.outcome==='accepted'?'install_accepted':'install_declined');
          if(choice?.outcome==='accepted')installed=true;installPrompt=null;render();
        }catch(_){/* ignore */}
      }else{track('install_ios_hint_shown');alert(t('install_ios_hint'));}
      return;
    }

    if(btn.id==='showNotes'){const s=activeSong();if(s?.notes){track('view_song_notes');alert(s.notes);}return;}
    if(btn.id==='playPause'){track('transport_play_pause');return togglePlay();}
    if(btn.id==='prev'){track('transport_prev');const item=resolvePrevious(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);if(item)await playResolved(item);return;}
    if(btn.id==='next'||btn.id==='playNext'){track('transport_next',{via:btn.id==='playNext'?'chip':'button'});const item=resolveNext(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);if(item)await playResolved(item);return;}
    if(btn.id==='rew'){track('transport_rewind');return engine.seek(-10);}
    if(btn.id==='fwd'){track('transport_forward');return engine.seek(10);}
    if(btn.id==='muteToggle'){
      muted=!muted;
      engine.setMuted(muted);
      await saveSetting('muted',muted);
      track('mute_toggle',{muted});
      return render();
    }

    if(btn.id==='transposeDown'){track('transpose_change',{delta:-1});return persistTranspose(-1);}
    if(btn.id==='transposeUp'){track('transpose_change',{delta:1});return persistTranspose(1);}
    if(btn.id==='audioPitchDown'){track('audio_pitch_change',{delta:-1});return persistAudioPitch(-1);}
    if(btn.id==='audioPitchUp'){track('audio_pitch_change',{delta:1});return persistAudioPitch(1);}

    if(btn.id==='newSet'){newSetModalOpen=true;track('new_setlist_open');return render();}
    if(btn.id==='cancelNewSet'){newSetModalOpen=false;return render();}
    if(btn.id==='confirmNewSet'){
      const name=document.querySelector('#newSetName')?.value.trim()||'New set list';
      if(isDirty(working,saved)&&!confirm(t('discard_confirm')))return;
      working=newSetlist(name||t('default_new_set_name'));saved=null;newSetModalOpen=false;drawerOpen=true;
      resetUndoHistory();
      track('new_setlist_created');
      return render();
    }
    if(btn.id==='saveSet'){
      working.updatedAt=new Date().toISOString();
      await repository.setlists.put(working);
      saved=clone(working);
      sets=[...sets.filter(s=>s.id!==working.id),clone(working)];
      setStatus(t('saved_set',{name:working.name}));
      track('save_setlist',{tracks:working.items.filter(i=>i.type==='track').length,breaks:working.items.filter(i=>i.type==='break').length});
      return render();
    }

    if(btn.id==='addSong'){pendingInsertAfter=null;return openSongPicker();}
    if(btn.id==='songPickerCancel'){return closeSongPicker();}
    if(btn.id==='songPickerNewFile'){songPickerOpen=false;return pickSongAndAppend();}
    if(btn.id==='undoAction'){return undoSetlistAction();}
    if(btn.id==='redoAction'){return redoSetlistAction();}
    if(btn.id==='addBreak'){pushUndo();addBreak(working);engine.updateLastKnownOrder(workingItemIds());track('add_break');return render();}

    const editId=target.closest('[data-edit-song]')?.dataset.editSong;
    if(editId){track('open_edit_sheet');return openEditSheet(editId);}

    const removeId=target.closest('[data-remove]')?.dataset.remove;
    if(removeId){
      const item=working.items.find(i=>i.id===removeId);
      pushUndo();
      track('remove_item',{type:item?.type||'unknown'});
      removeItem(working,removeId);engine.updateLastKnownOrder(workingItemIds());return render();
    }

    if(btn.id==='closeSheet'||btn.id==='cancelSheet'){editSheet=null;return render();}
    if(btn.id==='saveSheet')return saveEditSheet();
    if(btn.id==='importCifra'){track('import_cifra_file_click');document.querySelector('#cifraFile')?.click();return;}
    if(btn.id==='importClipboard'){track('import_cifra_clipboard_click');await pasteCifraFromClipboard();return;}
    if(btn.id==='importCifraClub'){track('cifraclub_open');openCifraClubSearch();return;}
    if(btn.id==='ccCancel'){cifraClubSearch=null;return render();}
    if(btn.id==='ccSearch'){await runCifraClubSearch();return;}
    const ccResult=target.closest('.cc-result[data-cc-url]');
    if(ccResult){track('cifraclub_pick_result');await pickCifraClubResult(ccResult.dataset.ccUrl);return;}
    const pickSongEl=target.closest('.cc-result[data-pick-song]');
    if(pickSongEl){track('song_picker_pick');appendExistingSong(pickSongEl.dataset.pickSong);return;}

    if(btn.classList?.contains('chord-card')){
      // No behavior for now; kept as future hook (chord tap → jump / diagram detail)
      return;
    }
  }catch(error){
    setStatus(error.message||t('something_wrong'),true);
    render();
  }
});

app.addEventListener('change',async event=>{
  const el=event.target;
  try{
    if(el.id==='openSet'){
      if(!el.value)return;
      if(isDirty(working,saved)&&!confirm(t('discard_confirm')))return render();
      const selected=sets.find(s=>s.id===el.value);
      if(selected){working=clone(selected);saved=clone(selected);resetUndoHistory();engine.updateLastKnownOrder(workingItemIds());track('open_setlist');render();}
      return;
    }
    if(el.dataset.breakDur){
      const item=working.items.find(i=>i.id===el.dataset.breakDur);
      if(item){
        item.durationMinutes=Math.max(1,Math.min(240,Number(el.value)||15));
        track('break_duration_edit',{minutes:item.durationMinutes});
        if(activeBreak?.id===item.id)startBreakTimer(item);
        render();
      }
      return;
    }
    if(el.id==='autoAdvanceToggle'){
      working.autoAdvance=el.checked;
      track('auto_advance_toggle',{enabled:el.checked});
      render();
      return;
    }
    if(el.id==='autoScroll'){
      const song=activeSong();if(!song)return;
      const updated=await saveScrollSettings(song.id,{enabled:el.checked,speed:song.cifraScrollSpeed});
      songs=songs.map(s=>s.id===updated.id?updated:s);
      track('auto_scroll_toggle',{enabled:el.checked});
      syncCifraAutoScroll();
      return;
    }
    if(el.id==='scrollSpeed'){
      const song=activeSong();if(!song)return;
      const updated=await saveScrollSettings(song.id,{speed:Number(el.value),enabled:song.cifraAutoScrollEnabled});
      songs=songs.map(s=>s.id===updated.id?updated:s);
      track('scroll_speed_change',{speed:Number(el.value)});
      return;
    }
    if(el.id==='cifraFile'){
      const file=el.files?.[0];if(!file||!editSheet)return;
      const text=await file.text();
      editSheet.cifra=text;
      const editor=document.querySelector('#editCifra');
      if(editor)editor.value=text;
      track('cifra_file_imported',{bytes:file.size});
      return;
    }
  }catch(error){setStatus(error.message||t('change_failed'),true);render();}
});

app.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='scrollSpeed'){
    const v=Number(el.value);
    const out=el.parentElement.querySelector('output');
    if(out)out.textContent=`${v.toFixed(2)}×`;
    const song=activeSong();
    if(song){song.cifraScrollSpeed=v;}
    return;
  }
  if(el.id==='songPickerSearch'){
    songPickerQuery=el.value;
    const results=document.querySelector('#songPickerResults');
    if(results)results.innerHTML=songPickerResultsHtml();
    return;
  }
  if(el.id==='editTitle'){editSheet.title=el.value;return;}
  if(el.id==='editArtist'){editSheet.artist=el.value;return;}
  if(el.id==='editNotes'){editSheet.notes=el.value;return;}
  if(el.id==='editCifra'){editSheet.cifra=el.value;return;}
});

// Suppress the OS context menu on setlist rows (Android long-press callout,
// desktop right-click) so long-press-to-drag stays clean.
app.addEventListener('contextmenu',event=>{
  if(event.target.closest('.row[data-id]'))event.preventDefault();
});

// ---------- Reorder via Pointer Events ----------
// One implementation for mouse, touch, and pen — replaces the old HTML5
// draggable/dragstart/dragover/drop trio, which was flaky on iOS Safari and
// merely serviceable on Android. Drag starts only from the grip handle so it
// never fights row-tap-to-play. The dragged row tracks the pointer with a CSS
// transform; siblings are physically reordered in the DOM as soon as the
// pointer crosses their midpoint, then render() reconciles everything against
// `working.items` once the gesture ends.

function dragNaturalTop(rowEl){
  const prevTransform=rowEl.style.transform;
  rowEl.style.transform='none';
  const top=rowEl.getBoundingClientRect().top;
  rowEl.style.transform=prevTransform;
  return top;
}
function applyDragTransform(){
  if(!dragState)return;
  const naturalTop=dragNaturalTop(dragState.rowEl);
  dragState.rowEl.style.transform=`translateY(${dragState.targetTop-naturalTop}px)`;
}
function checkDragReorder(){
  if(!dragState)return;
  const {rowEl,list,targetTop}=dragState;
  const height=rowEl.getBoundingClientRect().height;
  const draggedCenter=targetTop+height/2;
  const siblings=[...list.querySelectorAll('.row[data-id]')].filter(el=>el!==rowEl);
  let insertBefore=null;
  for(const sib of siblings){
    const r=sib.getBoundingClientRect();
    if(draggedCenter<r.top+r.height/2){insertBefore=sib;break;}
  }
  if(insertBefore){
    if(rowEl.nextElementSibling!==insertBefore){list.insertBefore(rowEl,insertBefore);applyDragTransform();}
  }else if(list.lastElementChild!==rowEl){
    list.appendChild(rowEl);applyDragTransform();
  }
}
function dragAutoScrollTick(){
  if(!dragState){dragScrollRaf=0;return;}
  const {list,lastPointerY}=dragState;
  const rect=list.getBoundingClientRect();
  const edge=48,maxSpeed=16;
  let dy=0;
  if(lastPointerY<rect.top+edge)dy=-maxSpeed*(1-Math.max(0,lastPointerY-rect.top)/edge);
  else if(lastPointerY>rect.bottom-edge)dy=maxSpeed*(1-Math.max(0,rect.bottom-lastPointerY)/edge);
  if(dy){
    // targetTop is a viewport-space coordinate (tracks the pointer 1:1), so it
    // stays correct as-is; scrolling only moves the natural position we diff against.
    list.scrollTop+=dy;
    applyDragTransform();
    checkDragReorder();
  }
  dragScrollRaf=requestAnimationFrame(dragAutoScrollTick);
}
function endDrag(commit){
  if(!dragState)return;
  const {rowEl,list,id,originalIndex}=dragState;
  cancelAnimationFrame(dragScrollRaf);dragScrollRaf=0;
  rowEl.style.transform='';
  rowEl.classList.remove('dragging');
  document.body.classList.remove('dragging-row');
  if(commit){
    const finalOrder=[...list.querySelectorAll('.row[data-id]')].map(el=>el.dataset.id);
    const newIndex=finalOrder.indexOf(id);
    if(newIndex>=0&&newIndex!==originalIndex){
      pushUndo();
      moveItem(working,id,newIndex);
      engine.updateLastKnownOrder(workingItemIds());
      track('reorder_item',{via:'pointer'});
    }
  }
  dragState=null;
  render();
}
app.addEventListener('pointerdown',event=>{
  if(event.button!=null&&event.button!==0)return; // left click / primary touch only
  const handle=event.target.closest('.drag');
  if(!handle)return;
  const row=handle.closest('.row[data-id]');
  const list=row?.closest('.drawer-list');
  if(!row||!list)return;
  event.preventDefault();
  const rows=[...list.querySelectorAll('.row[data-id]')];
  dragState={
    pointerId:event.pointerId,
    id:row.dataset.id,
    rowEl:row,
    list,
    originalIndex:rows.indexOf(row),
    initialRowTop:row.getBoundingClientRect().top,
    initialPointerY:event.clientY,
    lastPointerY:event.clientY,
    targetTop:row.getBoundingClientRect().top
  };
  try{row.setPointerCapture(event.pointerId);}catch(_){/* ignore */}
  row.classList.add('dragging');
  document.body.classList.add('dragging-row');
  dragScrollRaf=requestAnimationFrame(dragAutoScrollTick);
});
app.addEventListener('pointermove',event=>{
  if(!dragState||event.pointerId!==dragState.pointerId)return;
  event.preventDefault();
  dragState.lastPointerY=event.clientY;
  dragState.targetTop=dragState.initialRowTop+(event.clientY-dragState.initialPointerY);
  applyDragTransform();
  checkDragReorder();
});
app.addEventListener('pointerup',event=>{
  if(!dragState||event.pointerId!==dragState.pointerId)return;
  endDrag(true);
});
app.addEventListener('pointercancel',event=>{
  if(!dragState||event.pointerId!==dragState.pointerId)return;
  endDrag(false);
});

// Seek bar click
app.addEventListener('click',event=>{
  const bar=event.target.closest('#seekBar');
  if(!bar||!engine.session||!engine.duration)return;
  const rect=bar.getBoundingClientRect();
  const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  engine.seekTo(engine.duration*ratio);
});

// Cifra scroll highlight
app.addEventListener('scroll',event=>{
  if(event.target?.id==='cifraScroll')updateChordHighlight(event.target);
},true);
app.addEventListener('wheel',event=>{if(event.target.closest?.('#cifraScroll'))cifraScrollPos=document.querySelector('#cifraScroll').scrollTop;},{passive:true});
app.addEventListener('touchend',event=>{if(event.target.closest?.('#cifraScroll'))cifraScrollPos=document.querySelector('#cifraScroll').scrollTop;},{passive:true});

document.addEventListener('keydown',event=>{
  if(event.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){
    event.preventDefault();
    togglePlay();
  }
  if((event.ctrlKey||event.metaKey)&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)){
    const key=event.key.toLowerCase();
    if(key==='z'){event.preventDefault();return event.shiftKey?redoSetlistAction():undoSetlistAction();}
    if(key==='y'){event.preventDefault();return redoSetlistAction();}
  }
  if(event.key==='Escape'){
    if(onboardingStep!==null)return; // onboarding is intentional; use Skip
    if(settingsSheetOpen){settingsSheetOpen=false;return render();}
    if(songPickerOpen){songPickerOpen=false;return render();}
    if(cifraClubSearch){cifraClubSearch=null;return render();}
    if(editSheet){editSheet=null;return render();}
    if(newSetModalOpen){newSetModalOpen=false;return render();}
    if(drawerOpen){drawerOpen=false;return render();}
    if(fullscreen){fullscreen=false;return render();}
  }
});

window.addEventListener('beforeunload',event=>{
  if(isDirty(working,saved)){
    event.preventDefault();
    event.returnValue=t('beforeunload');
    return event.returnValue;
  }
});

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  track('install_prompt_available');
  render();
});
window.addEventListener('appinstalled',()=>{
  installed=true;
  installPrompt=null;
  track('app_installed');
  render();
});

// Engine reactive updates — minimal DOM patch to avoid flicker
engine.addEventListener('state',()=>{
  const paused=engine.paused||!engine.session;
  if(paused)releaseWakeLock(); else acquireWakeLock();
  const time=document.querySelector('.control-strip .time');
  const bar=document.querySelector('.control-strip .bar i');
  if(time)time.textContent=`${fmtTime(engine.currentTime)} / ${fmtTime(engine.duration)}`;
  if(bar)bar.style.width=engine.duration?`${engine.currentTime/engine.duration*100}%`:'0%';
  const playIcon=paused?icon('play'):icon('pause');
  const ariaLabel=paused?t('play'):t('pause');
  // Update every play/pause button in the tree (bottom strip, big-center, fullscreen)
  document.querySelectorAll('#playPause,.fs-play').forEach(btn=>{
    btn.innerHTML=playIcon;
    btn.setAttribute('aria-label',ariaLabel);
  });
  syncDiagnostics();
  if(autoScrollShouldRun()&&!cifraRaf)syncCifraAutoScroll();
  else if(!autoScrollShouldRun()&&cifraRaf)stopAutoScroll();
});
engine.addEventListener('ended',()=>{
  const next=resolveNext(working,engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);
  if(next?.type==='track'){
    if(working.autoAdvance!==false)playItemById(next.id);
    else render(); // manual chaining: stay put, "Next" chip is ready for the user
  }
  else if(next?.type==='break'){activeBreak=next;startBreakTimer(next);render();}
  else render();
});

// ---------- Boot ----------

async function boot(){
  try{
    const caps=storageCapabilities();
    if(!caps.indexedDB)throw Error(t('indexeddb_required'));
    await loadLanguage();
    const settings=await loadSettings();
    fontScale=clampFontScale(settings.fontScale);
    applyFontScale();
    muted=!!settings.muted;
    engine.setMuted(muted);
    if(!settings.onboardingCompleted)onboardingStep=0;
    songs=await listSongs();
    sets=await repository.setlists.all();
    if(!sets.length){
      saved=newSetlist('Friday Night');
      await repository.setlists.put(saved);
      sets=[clone(saved)];
      working=clone(saved);
    }else{
      saved=clone(sets[0]);
      working=clone(saved);
    }
    await storageEstimate().catch(()=>{});
    navigator.storage?.persist?.().catch(()=>{});
  }catch(error){
    storageError=error;
  }
  trackBoot({language:getLanguage(),songs:songs.length,setlists:sets.length,online:navigator.onLine});
  render();
  if('serviceWorker'in navigator){
    try{
      swRegistration=await navigator.serviceWorker.register('./sw.js?v=20');
      // A new SW is already waiting (installed on a previous visit but never activated)
      if(swRegistration.waiting&&navigator.serviceWorker.controller){updateAvailable=true;render();}
      swRegistration.addEventListener('updatefound',()=>{
        const worker=swRegistration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){updateAvailable=true;render();}
        });
      });
      // The waiting SW is skipped and takes over → controllerchange fires.
      // Only reload if the user opted in via the update pill; otherwise leave
      // the current tab alone.
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloadingForUpdate)location.reload();
      });
    }catch(_){/* ignore */}
  }
}

// Actively check for a new SW whenever the tab regains focus so long-running
// PWA sessions notice a fresh deploy.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&swRegistration){swRegistration.update().catch(()=>{});}
});

// Test hooks
window.__liveset={engine,snapshot:()=>engine.snapshot(),songs:()=>structuredClone(songs),sets:()=>structuredClone(sets),working:()=>structuredClone(working)};

render();
boot().catch(error=>{storageError=error;render();});
