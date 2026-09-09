import {newTrack,newSetlist} from './models.js?v=2';

const DB='liveset-db';
const VERSION=1;

export function storageCapabilities(){
  return {
    indexedDB:typeof indexedDB!=='undefined',
    opfs:!!navigator.storage?.getDirectory,
    navigatorStorage:!!navigator.storage
  };
}

export async function storageEstimate(){
  if(!navigator.storage?.estimate)return {usage:0,quota:0,available:Infinity,persisted:false};
  const {usage=0,quota=0}=await navigator.storage.estimate(),persisted=await navigator.storage.persisted?.().catch(()=>false)||false;
  return {usage,quota,available:Math.max(0,quota-usage),persisted};
}

export async function ensureStorageCapacity(requiredBytes){
  const estimate=await storageEstimate();
  if(Number.isFinite(estimate.available)&&estimate.available<requiredBytes*1.15){const error=Error(`Not enough local storage. ${Math.ceil(requiredBytes/1048576)} MB is required.`);error.name='QuotaExceededError';throw error;}
  return estimate;
}

export function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,VERSION);
    request.onupgradeneeded=()=>{
      for(const store of ['tracks','setlists','appSettings']){
        if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store,{keyPath:'id'});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function request(storeName,mode,operation){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(storeName,mode);
    const result=operation(transaction.objectStore(storeName));
    result.onsuccess=()=>resolve(result.result);
    result.onerror=()=>reject(result.error);
    transaction.oncomplete=()=>db.close();
  });
}

const all=store=>request(store,'readonly',objectStore=>objectStore.getAll());
const get=(store,id)=>request(store,'readonly',objectStore=>objectStore.get(id));
const put=(store,value)=>request(store,'readwrite',objectStore=>objectStore.put(value)).then(()=>value);
const remove=(store,id)=>request(store,'readwrite',objectStore=>objectStore.delete(id));

export const repository={
  tracks:{all:()=>all('tracks'),get:id=>get('tracks',id),put:value=>put('tracks',value),delete:id=>remove('tracks',id)},
  setlists:{all:()=>all('setlists'),get:id=>get('setlists',id),put:value=>put('setlists',value),delete:id=>remove('setlists',id)},
  appSettings:{all:()=>all('appSettings'),get:id=>get('appSettings',id),put:value=>put('appSettings',value),delete:id=>remove('appSettings',id)}
};

function extensionFor(file){
  return file.name.includes('.')?file.name.slice(file.name.lastIndexOf('.')):'.audio';
}

export async function writeAsset(file,trackId){
  await ensureStorageCapacity(file.size||0);
  const root=await navigator.storage.getDirectory();
  const liveset=await root.getDirectoryHandle('liveset',{create:true});
  const tracks=await liveset.getDirectoryHandle('tracks',{create:true});
  const trackDirectory=await tracks.getDirectoryHandle(trackId,{create:true});
  const filename=`original${extensionFor(file)}`;
  const handle=await trackDirectory.getFileHandle(filename,{create:true});
  const writable=await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return `tracks/${trackId}/${filename}`;
}

export async function deleteTrackAssets(trackId){
  try{
    const root=await navigator.storage.getDirectory();
    const liveset=await root.getDirectoryHandle('liveset');
    const tracks=await liveset.getDirectoryHandle('tracks');
    await tracks.removeEntry(trackId,{recursive:true});
  }catch(error){
    if(error?.name!=='NotFoundError')throw error;
  }
}

async function livesetDirectory(path='',create=false){
  const root=await navigator.storage.getDirectory();let directory=await root.getDirectoryHandle('liveset',{create:true});
  for(const part of path.split('/').filter(Boolean))directory=await directory.getDirectoryHandle(part,{create});
  return directory;
}

export async function readOpfsFile(path){
  const parts=path.split('/').filter(Boolean),name=parts.pop(),directory=await livesetDirectory(parts.join('/'));
  return (await directory.getFileHandle(name)).getFile();
}

export async function writeOpfsFile(path,data){
  const parts=path.split('/').filter(Boolean),name=parts.pop(),directory=await livesetDirectory(parts.join('/'),true),handle=await directory.getFileHandle(name,{create:true}),writable=await handle.createWritable();
  await writable.write(data);await writable.close();return path;
}

export async function removeOpfsPath(path,{recursive=false}={}){
  try{const parts=path.split('/').filter(Boolean),name=parts.pop(),directory=await livesetDirectory(parts.join('/'));await directory.removeEntry(name,{recursive});}
  catch(error){if(error?.name!=='NotFoundError')throw error;}
}

export async function commitStemGeneration(trackId,jobId,{repositoryOverride=repository}={}){
  const canonical=['vocals','guitar','bass','drums','other'],generationId=`generation-${jobId}`,sourceBase=`temp/splits/${jobId}`,targetBase=`tracks/${trackId}/stems/${generationId}`;
  const stored=await repositoryOverride.tracks.get(trackId);if(!stored)throw Error('Track not found.');
  const previous=structuredClone(stored),stems={};
  try{
    for(const stem of canonical){const filename=`${stem[0].toUpperCase()}${stem.slice(1)}.m4a`,source=await readOpfsFile(`${sourceBase}/${filename}`),target=`${targetBase}/${filename}`;await writeOpfsFile(target,source);stems[stem]=target;}
    const updated={...stored,stemState:'complete',stems,stemGeneration:generationId,updatedAt:new Date().toISOString()};
    await repositoryOverride.tracks.put(updated);
    if(previous.stemGeneration&&previous.stemGeneration!==generationId)await removeOpfsPath(`tracks/${trackId}/stems/${previous.stemGeneration}`,{recursive:true}).catch(()=>{});
    await removeOpfsPath(sourceBase,{recursive:true});return updated;
  }catch(error){await removeOpfsPath(targetBase,{recursive:true}).catch(()=>{});throw error;}
}

export async function cleanupSplitJob(jobId){return removeOpfsPath(`temp/splits/${jobId}`,{recursive:true});}

export async function assetUrl(track){
  const root=await navigator.storage.getDirectory();
  const liveset=await root.getDirectoryHandle('liveset');
  const tracks=await liveset.getDirectoryHandle('tracks');
  const trackDirectory=await tracks.getDirectoryHandle(track.id);
  const filename=track.originalAssetPath.split('/').pop();
  const file=await (await trackDirectory.getFileHandle(filename)).getFile();
  return URL.createObjectURL(file);
}

export async function probeAudioFile(file){
  if(!file||!file.size)throw Error('Selected audio file is empty.');
  const probe=new Audio();
  const url=URL.createObjectURL(file);
  try{
    probe.preload='metadata';
    probe.src=url;
    await new Promise((resolve,reject)=>{
      probe.onloadedmetadata=resolve;
      probe.onerror=()=>reject(Error('This audio format cannot be decoded on this device.'));
    });
    return {
      file,
      filename:file.name,
      mimeType:file.type,
      size:file.size,
      durationSeconds:Number.isFinite(probe.duration)?probe.duration:0,
      title:file.name.replace(/\.[^.]+$/,'')
    };
  }finally{
    probe.removeAttribute('src');
    probe.load();
    URL.revokeObjectURL(url);
  }
}

export async function importTrack(file){
  const probe=await probeAudioFile(file);
  const track=newTrack({title:probe.title,originalFilename:probe.filename,originalMimeType:probe.mimeType,originalSize:probe.size,durationSeconds:probe.durationSeconds});
  try{
    track.originalAssetPath=await writeAsset(file,track.id);
    await repository.tracks.put(track);
    return track;
  }catch(error){
    await deleteTrackAssets(track.id).catch(()=>{});
    throw error;
  }
}

export {newSetlist,newTrack};
