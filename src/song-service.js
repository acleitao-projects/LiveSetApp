import {newSong} from './models.js';
import {repository,storageCapabilities,writeOpfsFile,readOpfsFile,removeOpfsPath} from './storage.js';

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

export async function pickAndRegisterSong(){
  if(preferHandlePath())return pickViaHandle();
  return pickViaInputCopy();
}

async function pickViaHandle(){
  const [handle]=await window.showOpenFilePicker({
    multiple:false,
    types:[{description:'Audio',accept:{'audio/*':['.mp3','.m4a','.aac','.wav','.flac','.ogg','.oga','.opus']}}]
  });
  const file=await handle.getFile();
  const existing=await dedupeMatch(file.name,file.size);
  if(existing){
    // update handle in case it moved
    existing.source={kind:'handle',handle};
    existing.updatedAt=new Date().toISOString();
    await repository.songs.put(existing);
    return existing;
  }
  const probed=await probe(file);
  const song=newSong({
    title:titleFromFilename(file.name),
    originalFilename:file.name,
    originalSize:file.size,
    durationSeconds:probed.durationSeconds,
    source:{kind:'handle',handle}
  });
  await repository.songs.put(song);
  return song;
}

export async function registerFromInputFile(file){
  const existing=await dedupeMatch(file.name,file.size);
  if(existing)return existing;
  const probed=await probe(file);
  const song=newSong({
    title:titleFromFilename(file.name),
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

async function pickViaInputCopy(){
  return new Promise((resolve,reject)=>{
    const input=document.createElement('input');
    input.type='file';input.accept=AUDIO_ACCEPT;
    input.onchange=async()=>{
      const file=input.files?.[0];
      if(!file)return resolve(null);
      try{resolve(await registerFromInputFile(file));}catch(error){reject(error);}
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
export function saveTranspose(id,semitones){return updateSong(id,song=>{song.transposeSemitones=Math.max(-12,Math.min(12,Math.round(Number(semitones)||0)));});}
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
