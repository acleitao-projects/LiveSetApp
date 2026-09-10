import {newSong} from './models.js?v=38';
import {repository,storageCapabilities,writeOpfsFile,readOpfsFile,removeOpfsPath} from './storage.js?v=38';
import {isMp3File,readMp3Metadata,rewriteMp3Metadata} from './id3.js?v=38';

const AUDIO_ACCEPT='.mp3,.m4a,.aac,.wav,.flac,.ogg,.oga,.opus,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/flac,audio/ogg,audio/*';

export function audioAcceptString(){return AUDIO_ACCEPT;}

async function probe(file){
  if(!file||!file.size)throw Error('Selected audio file is empty.');
  const url=URL.createObjectURL(file);
  const audio=new Audio();
  try{
    audio.preload='metadata';audio.src=url;
    await new Promise((resolve,reject)=>{
      audio.onloadedmetadata=()=>resolve();
      audio.onerror=()=>reject(Error('This audio format cannot be decoded on this device.'));
    });
    return {durationSeconds:Number.isFinite(audio.duration)?audio.duration:0,mimeType:file.type};
  }finally{audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
}

function fingerprintKey(filename,size){return `${filename}::${size}`;}

async function dedupeMatch(filename,size){
  const list=await repository.songs.all();
  return list.find(song=>song.originalFilename===filename&&song.originalSize===size)||null;
}

function titleFromFilename(name){return String(name||'').replace(/\.[^.]+$/,'')||'Untitled';}

async function importedMetadata(file){
  if(!isMp3File(file))return {title:'',artist:'',lyrics:''};
  try{return await readMp3Metadata(file);}catch(_){return {title:'',artist:'',lyrics:''};}
}

async function copyToOpfs(file,songId){
  const ext=file.name.includes('.')?file.name.slice(file.name.lastIndexOf('.')):'.audio';
  const path=`songs/${songId}/original${ext}`;
  await writeOpfsFile(path,file);
  return path;
}

function preferHandlePath(){
  const caps=storageCapabilities();
  return caps.fileSystemAccess;
}

// Multi-file entry point. Returns an array of registered Song records (existing or new).
export async function pickAndRegisterSongs(){
  if(preferHandlePath())return pickViaHandleMulti();
  return pickViaInputCopyMulti();
}

// Back-compat single-file wrapper.
export async function pickAndRegisterSong(){
  const list=await pickAndRegisterSongs();
  return list?.[0]||null;
}

async function registerFromHandle(handle){
  const file=await handle.getFile();
  const existing=await dedupeMatch(file.name,file.size);
  if(existing){
    existing.source={kind:'handle',handle};
    existing.updatedAt=new Date().toISOString();
    await repository.songs.put(existing);
    return existing;
  }
  const probed=await probe(file);
  const metadata=await importedMetadata(file);
  const song=newSong({
    title:metadata.title||titleFromFilename(file.name),
    artist:metadata.artist,
    cifraSource:metadata.lyrics,
    originalFilename:file.name,
    originalSize:file.size,
    durationSeconds:probed.durationSeconds,
    source:{kind:'handle',handle}
  });
  await repository.songs.put(song);
  return song;
}

async function pickViaHandleMulti(){
  const handles=await window.showOpenFilePicker({
    multiple:true,
    types:[{description:'Audio',accept:{'audio/*':['.mp3','.m4a','.aac','.wav','.flac','.ogg','.oga','.opus']}}]
  });
  const registered=[];
  for(const handle of handles){
    try{registered.push(await registerFromHandle(handle));}
    catch(_){/* skip one bad file; keep the rest */}
  }
  return registered;
}

export async function registerFromInputFile(file){
  const existing=await dedupeMatch(file.name,file.size);
  if(existing)return existing;
  const probed=await probe(file);
  const metadata=await importedMetadata(file);
  const song=newSong({
    title:metadata.title||titleFromFilename(file.name),
    artist:metadata.artist,
    cifraSource:metadata.lyrics,
    originalFilename:file.name,
    originalSize:file.size,
    durationSeconds:probed.durationSeconds,
    source:{kind:'pending'}
  });
  try{
    const path=await copyToOpfs(file,song.id);
    song.source={kind:'opfs',path};
    await repository.songs.put(song);
    return song;
  }catch(error){
    await removeOpfsPath(`songs/${song.id}`,{recursive:true}).catch(()=>{});
    throw error;
  }
}

async function pickViaInputCopyMulti(){
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input');
    input.type='file';input.accept=AUDIO_ACCEPT;input.multiple=true;
    input.onchange=async()=>{
      const files=[...(input.files||[])];
      if(!files.length)return resolve([]);
      const registered=[];
      for(const file of files){
        try{registered.push(await registerFromInputFile(file));}
        catch(_){/* skip failed file; keep the rest */}
      }
      resolve(registered);
    };
    input.click();
  });
}

async function ensureHandlePermission(handle){
  if(!handle?.queryPermission)return true;
  const query=await handle.queryPermission({mode:'read'});
  if(query==='granted')return true;
  const request=await handle.requestPermission({mode:'read'});
  return request==='granted';
}

async function ensureHandleWritePermission(handle){
  if(!handle?.queryPermission)return true;
  const query=await handle.queryPermission({mode:'readwrite'});
  if(query==='granted')return true;
  const request=await handle.requestPermission({mode:'readwrite'});
  return request==='granted';
}

export async function songUrl(song){
  if(!song?.source)throw Error('Song has no audio source.');
  if(song.source.kind==='handle'){
    const ok=await ensureHandlePermission(song.source.handle);
    if(!ok)throw Error('Permission to read this audio file was not granted.');
    const file=await song.source.handle.getFile();
    return URL.createObjectURL(file);
  }
  if(song.source.kind==='opfs'){
    const file=await readOpfsFile(song.source.path);
    return URL.createObjectURL(file);
  }
  throw Error(`Unknown audio source kind: ${song.source.kind}`);
}

export async function listSongs(){
  const list=await repository.songs.all();
  return list.sort((a,b)=>a.title.localeCompare(b.title));
}

export async function getSong(id){return repository.songs.get(id);}

async function updateSong(id,mutator){
  const stored=await repository.songs.get(id);
  if(!stored)throw Error('Song not found.');
  mutator(stored);
  stored.updatedAt=new Date().toISOString();
  await repository.songs.put(stored);
  return stored;
}

export function saveCifra(id,cifraSource){return updateSong(id,song=>{song.cifraSource=String(cifraSource||'');});}
export function saveMetadata(id,{title,artist}){return updateSong(id,song=>{if(title!=null)song.title=String(title);if(artist!=null)song.artist=String(artist);});}
export async function saveSongEdits(id,{title,artist,cifra,notes},sourceHint=null){
  let hintedWritePermission=null;
  if(isMp3File(sourceHint)&&sourceHint?.source?.kind==='handle'){
    hintedWritePermission=await ensureHandleWritePermission(sourceHint.source.handle);
    if(!hintedWritePermission)throw Error('Permission to update this MP3 file was not granted.');
  }
  const stored=await repository.songs.get(id);
  if(!stored)throw Error('Song not found.');
  const updated={...stored,title:String(title??stored.title),artist:String(artist??stored.artist),cifraSource:String(cifra??stored.cifraSource),notes:String(notes??stored.notes??''),updatedAt:new Date().toISOString()};
  let metadataWritten=false;
  if(isMp3File(stored)){
    let file;
    if(stored.source?.kind==='handle'){
      if(hintedWritePermission!==true&&!await ensureHandleWritePermission(stored.source.handle))throw Error('Permission to update this MP3 file was not granted.');
      file=await stored.source.handle.getFile();
      const rewritten=await rewriteMp3Metadata(file,{title:updated.title,artist:updated.artist,lyrics:updated.cifraSource});
      const writable=await stored.source.handle.createWritable();
      try{await writable.write(rewritten);await writable.close();}catch(error){await writable.abort?.().catch(()=>{});throw error;}
      updated.originalSize=rewritten.size;
      metadataWritten=true;
    }else if(stored.source?.kind==='opfs'){
      file=await readOpfsFile(stored.source.path);
      const rewritten=await rewriteMp3Metadata(file,{title:updated.title,artist:updated.artist,lyrics:updated.cifraSource});
      await writeOpfsFile(stored.source.path,rewritten);
      updated.originalSize=rewritten.size;
      metadataWritten=true;
    }
  }
  await repository.songs.put(updated);
  return {song:updated,metadataWritten};
}
export function saveTranspose(id,semitones){return updateSong(id,song=>{song.transposeSemitones=Math.max(-12,Math.min(12,Math.round(Number(semitones)||0)));});}
export function saveAudioPitch(id,semitones){return updateSong(id,song=>{song.audioPitchSemitones=Math.max(-3,Math.min(3,Math.round(Number(semitones)||0)));});}
export function saveScrollSettings(id,{speed,enabled}){return updateSong(id,song=>{if(speed!=null)song.cifraScrollSpeed=Math.max(0,Math.min(5,Number(speed)||0));if(enabled!=null)song.cifraAutoScrollEnabled=!!enabled;});}

export async function deleteSong(id){
  const stored=await repository.songs.get(id);
  if(stored?.source?.kind==='opfs')await removeOpfsPath(`songs/${id}`,{recursive:true}).catch(()=>{});
  await repository.songs.delete(id);
}

export function searchSongs(songs,query,limit=50){
  const q=String(query||'').trim().toLowerCase();
  if(!q)return [];
  const matches=[];
  for(const song of songs){
    const haystack=`${song.title} ${song.artist||''} ${song.originalFilename||''}`.toLowerCase();
    if(haystack.includes(q))matches.push(song);
    if(matches.length>=limit)break;
  }
  return matches;
}
