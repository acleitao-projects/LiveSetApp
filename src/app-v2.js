import {repository,storageCapabilities,storageEstimate} from './storage.js';
import {newSetlist,trackItem,breakItem} from './models.js';
import {clone,isDirty,insertAfter,appendTrack,addBreak,removeItem,moveItem,resolveNext,resolvePrevious,totalDurationSeconds,formatDuration} from './setlist.js';
import {AudioEngine} from './audio.js';
import {pickAndRegisterSong,registerFromInputFile,songUrl,listSongs,saveCifra,saveMetadata,saveTranspose,saveScrollSettings,getSong,audioAcceptString} from './song-service.js';
import {parseCifra} from './cifra.js';
import {chordDiagramSvg} from './chords.js';
import {advanceCifraScroll} from './cifra-scroll.js';
import {transposeChordLine,transposeChordSymbol} from './transpose.js';
import {icon} from './icons.js';
import {t,loadLanguage,setLanguage,getLanguage,supportedLanguages} from './i18n.js';
import {searchCifraClub,fetchCifraFromUrl} from './cifraclub-import.js';

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

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=s=>Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00';
const activeSong=()=>songs.find(s=>s.id===engine.session?.songId);
const songById=id=>songs.find(s=>s.id===id);
const workingItemIds=()=>working.items.map(i=>i.id);

function setStatus(msg,error=false){statusMessage=msg;statusError=!!error;}

// ---------- Rendering ----------

function render(){
  const song=activeSong();
  const currentSongId=song?.id||null;
  const songChanged=currentSongId!==lastRenderedSongId;
  const prevScroll=songChanged?0:(document.querySelector('#cifraScroll')?.scrollTop||0);
  lastRenderedSongId=currentSongId;
  const parsed=song?.cifraSource?parseCifra(song.cifraSource):null;
  const transposed=parsed?applyTranspose(parsed,song.transposeSemitones||0):null;
  const nextItem=resolveNext(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);
  const nextSong=nextItem?.type==='track'?songById(nextItem.songId):null;

  app.className=fullscreen?'fs':'';
  app.innerHTML=`
    ${!fullscreen?renderTopbar():''}
    ${!fullscreen?renderSongHeader(song,nextSong,nextItem):''}
    <main class="stage">
      <div class="performance-body">
        ${transposed?renderChordRail(transposed,'left'):'<div></div>'}
        ${renderCifra(song,transposed)}
        ${transposed?renderChordRail(transposed,'right'):'<div></div>'}
      </div>
      ${''/* rails share the full uniqueChords list; on wide screens each becomes a 2-col grid so all chords are visible on both sides */}
    </main>
    ${!fullscreen?renderControlStrip(song):''}
    ${fullscreen?renderFullscreenControls():''}
    ${drawerOpen?renderDrawer():''}
    ${editSheet?renderEditSheet():''}
    ${cifraClubSearch?renderCifraClubModal():''}
    ${newSetModalOpen?renderNewSetModal():''}
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
  return `<div class="song-header">
    <div class="title">
      <h1>${esc(song?.title||t('ready'))}</h1>
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
      <div class="transpose" role="group" aria-label="${esc(t('transpose_group'))}">
        <button id="transposeDown" ${song?'':'disabled'} aria-label="${esc(t('transpose_down'))}">−</button>
        <span class="value">${transpose>0?'+':''}${transpose}</span>
        <button id="transposeUp" ${song?'':'disabled'} aria-label="${esc(t('transpose_up'))}">+</button>
        <span class="label">${esc(t('semi'))}</span>
      </div>
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
    <button class="fs-play" id="playPause" aria-label="${esc(paused?t('play'):t('pause'))}">${paused?icon('play'):icon('pause')}</button>`;
}

function renderDrawer(){
  const dur=totalDurationSeconds(working,new Map(songs.map(s=>[s.id,s])));
  const dirty=isDirty(working,saved);
  const lang=getLanguage();
  const showInstall=!installed&&(installPrompt||(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!matchMedia('(display-mode: standalone)').matches));
  return `<div class="drawer-scrim" id="drawerScrim"></div>
  <aside class="drawer">
    <div class="drawer-head">
      <h2>${esc(t('set_list'))}</h2>
      <button class="btn icon ghost" id="closeDrawer" aria-label="${esc(t('close_set_list'))}">${icon('close')}</button>
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
    <div class="drawer-foot">
      <div class="lang-toggle" role="group" aria-label="${esc(t('language'))}">
        ${supportedLanguages().map(code=>`<button class="lang-chip ${code===lang?'active':''}" data-lang="${code}">${code.toUpperCase()}</button>`).join('')}
      </div>
      ${showInstall?`<button class="btn small install-btn" id="installApp">${icon('save')}${esc(t('install'))}</button>`:''}
    </div>
  </aside>`;
}

function renderTrackRow(item,index){
  const song=songById(item.songId);
  const isActive=engine.session?.originatingSetlistItemId===item.id||activeBreak?.id===item.id;
  const trackNum=String(working.items.slice(0,index+1).filter(i=>i.type==='track').length).padStart(2,'0');
  return `<div class="row track ${isActive?'active':''}" draggable="true" data-id="${item.id}" data-play="${item.id}">
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
  return `<div class="row break" draggable="true" data-id="${item.id}">
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
  return `<div class="sheet-scrim" id="sheetScrim"></div>
  <aside class="sheet">
    <div class="sheet-head">
      <h2>${esc(t('edit_song'))}</h2>
      <button class="btn icon ghost" id="closeSheet" aria-label="${esc(t('cancel'))}">${icon('close')}</button>
    </div>
    <div class="sheet-body">
      <div class="field"><label for="editTitle">${esc(t('title'))}</label><input id="editTitle" value="${esc(editSheet.title)}"></div>
      <div class="field"><label for="editArtist">${esc(t('artist'))}</label><input id="editArtist" value="${esc(editSheet.artist)}"></div>
      <div class="field" style="flex:1;min-height:280px">
        <label for="editCifra">${esc(t('cifra'))}
          <span class="cifra-import-actions">
            <button class="btn small" id="importCifraClub">${icon('music')}${esc(t('import_cifraclub'))}</button>
            <button class="btn small" id="importCifra">${icon('file')}${esc(t('import_txt_cho'))}</button>
          </span>
        </label>
        <textarea id="editCifra" class="cifra-editor" placeholder="[Intro]&#10;Am   F   C   G&#10;&#10;[Verse]&#10;...">${esc(editSheet.cifra)}</textarea>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn" id="cancelSheet">${esc(t('cancel'))}</button>
      <button class="btn primary" id="saveSheet">${esc(t('save'))}</button>
    </div>
    <input type="file" id="cifraFile" accept=".txt,.cho,.crd,.chopro,text/plain" hidden>
  </aside>`;
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

// ---------- Playback ----------

async function enterBreak(item){
  activeBreak=item;
  if(engine.session&&!engine.paused)await engine.toggle();
  render();
}

async function playItemById(itemId){
  const item=working.items.find(i=>i.id===itemId);
  if(!item)return;
  if(item.type==='break')return enterBreak(item);
  const song=songById(item.songId);
  if(!song){setStatus(t('song_missing_library'),true);render();return;}
  activeBreak=null;
  try{
    const url=await songUrl(song);
    await engine.playSong(song,item.id,url,workingItemIds());
    engine.updateLastKnownOrder(workingItemIds());
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
    if(next){activeBreak=null;return playResolved(next);}
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

async function pickSongAndAppend(){
  try{
    const song=await pickAndRegisterSong();
    if(!song)return;
    if(!songs.find(s=>s.id===song.id))songs=[...songs,song];
    else songs=songs.map(s=>s.id===song.id?song:s);
    const item=trackItem(song.id);
    if(pendingInsertAfter)insertAfter(working,pendingInsertAfter,item);
    else appendTrack(working,song.id);
    pendingInsertAfter=null;
    engine.updateLastKnownOrder(workingItemIds());
    setStatus(t('added_song',{title:song.title}));
    render();
  }catch(error){
    if(error?.name==='AbortError')return;
    setStatus(error.message||t('could_not_add'),true);
    render();
  }
}

async function reloadSongs(){
  songs=await listSongs();
}

function openEditSheet(songId){
  const song=songById(songId);
  if(!song)return;
  editSheet={songId,title:song.title,artist:song.artist||'',cifra:song.cifraSource||''};
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
  }catch(error){
    cifraClubSearch.error=ccErrorMessage(error);
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
    let updated=await saveMetadata(songId,{title,artist});
    updated=await saveCifra(songId,cifra);
    songs=songs.map(s=>s.id===updated.id?updated:s);
    editSheet=null;
    setStatus(t('song_saved'));
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
  if(target.id==='drawerScrim'){drawerOpen=false;return render();}
  if(target.id==='sheetScrim'){editSheet=null;return render();}
  if(target.id==='newSetScrim'){newSetModalOpen=false;return render();}
  if(target.id==='ccScrim'){cifraClubSearch=null;return render();}

  // Language chip
  const langBtn=target.closest('.lang-chip[data-lang]');
  if(langBtn){await setLanguage(langBtn.dataset.lang);return render();}

  const btn=target.closest('button,select,label,.row.track,.chord-card');
  if(!btn)return;

  // Playing rows: click anywhere on the row body except drag / actions
  const rowPlay=target.closest('[data-play]');
  if(rowPlay&&!target.closest('.drag,.row-action,input')){
    return playItemById(rowPlay.dataset.play);
  }

  try{
    if(btn.id==='openDrawer'){drawerOpen=true;return render();}
    if(btn.id==='closeDrawer'){drawerOpen=false;return render();}
    if(btn.id==='fullscreenToggle'){fullscreen=true;return render();}
    if(btn.id==='fullscreenExit'){fullscreen=false;return render();}
    if(btn.id==='applyUpdate'){navigator.serviceWorker?.controller?.postMessage({type:'SKIP_WAITING'});location.reload();return;}
    if(btn.id==='installApp'){
      if(installPrompt){
        try{await installPrompt.prompt();const choice=await installPrompt.userChoice;if(choice?.outcome==='accepted')installed=true;installPrompt=null;render();}
        catch(_){/* ignore */}
      }else{alert(t('install_ios_hint'));}
      return;
    }

    if(btn.id==='playPause')return togglePlay();
    if(btn.id==='prev'){const item=resolvePrevious(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);if(item)await playResolved(item);return;}
    if(btn.id==='next'||btn.id==='playNext'){const item=resolveNext(working,activeBreak?.id||engine.session?.originatingSetlistItemId,engine.session?.lastKnownOrder||[]);if(item)await playResolved(item);return;}
    if(btn.id==='rew')return engine.seek(-10);
    if(btn.id==='fwd')return engine.seek(10);

    if(btn.id==='transposeDown')return persistTranspose(-1);
    if(btn.id==='transposeUp')return persistTranspose(1);

    if(btn.id==='newSet'){newSetModalOpen=true;return render();}
    if(btn.id==='cancelNewSet'){newSetModalOpen=false;return render();}
    if(btn.id==='confirmNewSet'){
      const name=document.querySelector('#newSetName')?.value.trim()||'New set list';
      if(isDirty(working,saved)&&!confirm(t('discard_confirm')))return;
      working=newSetlist(name||t('default_new_set_name'));saved=null;newSetModalOpen=false;drawerOpen=true;return render();
    }
    if(btn.id==='saveSet'){
      working.updatedAt=new Date().toISOString();
      await repository.setlists.put(working);
      saved=clone(working);
      sets=[...sets.filter(s=>s.id!==working.id),clone(working)];
      setStatus(t('saved_set',{name:working.name}));
      return render();
    }

    if(btn.id==='addSong'){pendingInsertAfter=null;return pickSongAndAppend();}
    if(btn.id==='addBreak'){addBreak(working);engine.updateLastKnownOrder(workingItemIds());return render();}

    const editId=target.closest('[data-edit-song]')?.dataset.editSong;
    if(editId)return openEditSheet(editId);

    const removeId=target.closest('[data-remove]')?.dataset.remove;
    if(removeId){removeItem(working,removeId);engine.updateLastKnownOrder(workingItemIds());return render();}

    if(btn.id==='closeSheet'||btn.id==='cancelSheet'){editSheet=null;return render();}
    if(btn.id==='saveSheet')return saveEditSheet();
    if(btn.id==='importCifra'){document.querySelector('#cifraFile')?.click();return;}
    if(btn.id==='importCifraClub'){openCifraClubSearch();return;}
    if(btn.id==='ccCancel'){cifraClubSearch=null;return render();}
    if(btn.id==='ccSearch'){await runCifraClubSearch();return;}
    const ccResult=target.closest('.cc-result[data-cc-url]');
    if(ccResult){await pickCifraClubResult(ccResult.dataset.ccUrl);return;}

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
  const t=event.target;
  try{
    if(t.id==='openSet'){
      if(!t.value)return;
      if(isDirty(working,saved)&&!confirm(t('discard_confirm')))return render();
      const selected=sets.find(s=>s.id===t.value);
      if(selected){working=clone(selected);saved=clone(selected);engine.updateLastKnownOrder(workingItemIds());render();}
      return;
    }
    if(t.dataset.breakDur){
      const item=working.items.find(i=>i.id===t.dataset.breakDur);
      if(item){item.durationMinutes=Math.max(1,Math.min(240,Number(t.value)||15));render();}
      return;
    }
    if(t.id==='autoScroll'){
      const song=activeSong();if(!song)return;
      const updated=await saveScrollSettings(song.id,{enabled:t.checked,speed:song.cifraScrollSpeed});
      songs=songs.map(s=>s.id===updated.id?updated:s);
      syncCifraAutoScroll();
      return;
    }
    if(t.id==='scrollSpeed'){
      const song=activeSong();if(!song)return;
      const updated=await saveScrollSettings(song.id,{speed:Number(t.value),enabled:song.cifraAutoScrollEnabled});
      songs=songs.map(s=>s.id===updated.id?updated:s);
      return;
    }
    if(t.id==='cifraFile'){
      const file=t.files?.[0];if(!file||!editSheet)return;
      const text=await file.text();
      editSheet.cifra=text;
      const editor=document.querySelector('#editCifra');
      if(editor)editor.value=text;
      return;
    }
  }catch(error){setStatus(error.message||t('change_failed'),true);render();}
});

app.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='scrollSpeed'){
    const v=Number(t.value);
    const out=t.parentElement.querySelector('output');
    if(out)out.textContent=`${v.toFixed(2)}×`;
    const song=activeSong();
    if(song){song.cifraScrollSpeed=v;}
    return;
  }
  if(t.id==='editTitle'){editSheet.title=t.value;return;}
  if(t.id==='editArtist'){editSheet.artist=t.value;return;}
  if(t.id==='editCifra'){editSheet.cifra=t.value;return;}
});

// Drag & drop reorder within the drawer
let dragId=null;
app.addEventListener('dragstart',event=>{
  const row=event.target.closest('.row[draggable="true"]');
  if(!row)return;
  dragId=row.dataset.id;
  event.dataTransfer.effectAllowed='move';
});
app.addEventListener('dragover',event=>{
  if(!event.target.closest('.row[draggable="true"]'))return;
  event.preventDefault();
});
app.addEventListener('drop',event=>{
  const row=event.target.closest('.row[draggable="true"]');
  if(!row||!dragId)return;
  event.preventDefault();
  const targetIndex=working.items.findIndex(i=>i.id===row.dataset.id);
  moveItem(working,dragId,targetIndex);
  dragId=null;
  engine.updateLastKnownOrder(workingItemIds());
  render();
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
  if(event.key==='Escape'){
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
  render();
});
window.addEventListener('appinstalled',()=>{
  installed=true;
  installPrompt=null;
  render();
});

// Engine reactive updates — minimal DOM patch to avoid flicker
engine.addEventListener('state',()=>{
  const paused=engine.paused||!engine.session;
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
  if(next?.type==='track')playItemById(next.id);
  else if(next?.type==='break'){activeBreak=next;render();}
  else render();
});

// ---------- Boot ----------

async function boot(){
  try{
    const caps=storageCapabilities();
    if(!caps.indexedDB)throw Error(t('indexeddb_required'));
    await loadLanguage();
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
  render();
  if('serviceWorker'in navigator){
    try{
      const registration=await navigator.serviceWorker.register('./sw.js?v=12');
      if(registration.waiting)updateAvailable=true;
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'&&navigator.serviceWorker.controller){updateAvailable=true;render();}
        });
      });
    }catch(_){/* ignore */}
  }
}

// Test hooks
window.__liveset={engine,snapshot:()=>engine.snapshot(),songs:()=>structuredClone(songs),sets:()=>structuredClone(sets),working:()=>structuredClone(working)};

render();
boot().catch(error=>{storageError=error;render();});
