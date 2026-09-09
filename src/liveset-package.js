import {Zip,ZipPassThrough,strToU8,unzipSync,strFromU8} from './vendor/fflate.js';
import {STEMS,uid} from './models.js?v=2';
import {repository,readOpfsFile,writeOpfsFile,removeOpfsPath,deleteTrackAssets} from './storage.js?v=3';

const FORMAT='LiveSet1',VERSION=1,MAX_FILES=5000,MAX_ARCHIVE_BYTES=4*1024*1024*1024,MAX_JSON_BYTES=5*1024*1024;
const safePath=path=>typeof path==='string'&&path.length<=500&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(part=>!part||part==='.'||part==='..');
const jsonBytes=value=>strToU8(JSON.stringify(value,null,2));
const extension=path=>{const name=path.split('/').pop(),at=name.lastIndexOf('.');return at>=0?name.slice(at):'.audio';};
const complete=track=>track?.stemState==='complete'&&STEMS.every(stem=>typeof track.stems?.[stem]==='string'&&track.stems[stem]);

async function extractArchive(file){
  const buffer=await file.arrayBuffer();
  if(typeof Worker==='undefined')return unzipSync(new Uint8Array(buffer));
  return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./liveset-package-worker.js?v=1',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.type==='complete'?resolve(data.entries):reject(Error(data.message));};worker.onerror=event=>{worker.terminate();reject(Error(event.message||'Package extraction worker failed.'));};worker.postMessage({buffer},[buffer]);});
}

export function validatePackageEntries(entries){
  const paths=Object.keys(entries);if(!paths.length||paths.length>MAX_FILES)throw Error('Invalid .liveset file count.');
  for(const path of paths)if(!safePath(path))throw Error(`Unsafe package path: ${path}`);
  if(!entries['manifest.json']||entries['manifest.json'].length>MAX_JSON_BYTES)throw Error('Package manifest is missing or too large.');
  let manifest;try{manifest=JSON.parse(strFromU8(entries['manifest.json']));}catch{throw Error('Package manifest is not valid JSON.');}
  if(manifest.format!==FORMAT||manifest.formatVersion!==VERSION)throw Error('Unsupported .liveset format or version.');
  if(manifest.packageType!=='setlist')throw Error('This LiveSet build imports complete setlist packages.');
  if(!manifest.rootId||!entries['setlist.json'])throw Error('Setlist package root is incomplete.');
  let setlist;try{setlist=JSON.parse(strFromU8(entries['setlist.json']));}catch{throw Error('Setlist metadata is not valid JSON.');}
  if(setlist.id!==manifest.rootId||!Array.isArray(setlist.items))throw Error('Setlist package root ID or items are invalid.');
  const trackIds=[...new Set(setlist.items.filter(item=>item?.type==='track').map(item=>item.trackId))],tracks=[];
  for(const trackId of trackIds){
    if(typeof trackId!=='string'||!trackId)throw Error('Setlist contains an invalid Track reference.');
    const base=`tracks/${trackId}`,metadata=entries[`${base}/track.json`];if(!metadata||metadata.length>MAX_JSON_BYTES)throw Error(`Track ${trackId} metadata is missing.`);
    let track;try{track=JSON.parse(strFromU8(metadata));}catch{throw Error(`Track ${trackId} metadata is invalid.`);}
    if(track.id!==trackId||!track.packageOriginalPath||!entries[`${base}/${track.packageOriginalPath}`])throw Error(`Track ${trackId} original audio is missing.`);
    if(track.stemState==='complete')for(const stem of STEMS){const path=track.packageStems?.[stem];if(!path||!entries[`${base}/${path}`])throw Error(`Track ${trackId} has an incomplete five-stem set.`);}
    tracks.push({base,track});
  }
  return {manifest,setlist,tracks};
}

async function zipEntries(entries){
  return new Promise((resolve,reject)=>{const chunks=[],zip=new Zip((error,data,final)=>{if(error)return reject(error);chunks.push(data);if(final)resolve(new Blob(chunks,{type:'application/zip'}));});(async()=>{try{for(const {path,data} of entries){const entry=new ZipPassThrough(path);zip.add(entry);if(data instanceof Uint8Array)entry.push(data,true);else{const reader=data.stream().getReader();while(true){const {done,value}=await reader.read();if(done)break;entry.push(value,false);}entry.push(new Uint8Array(),true);}}zip.end();}catch(error){zip.terminate();reject(error);}})();});
}

export async function exportSetlistPackage(setlist,{repositoryOverride=repository,readFile=readOpfsFile}={}){
  if(!setlist?.id||!Array.isArray(setlist.items))throw Error('Select a saved set list to export.');
  const ids=[...new Set(setlist.items.filter(item=>item.type==='track').map(item=>item.trackId))],entries=[];
  entries.push({path:'manifest.json',data:jsonBytes({format:FORMAT,formatVersion:VERSION,packageType:'setlist',createdAt:new Date().toISOString(),appVersion:'0.1.0',rootId:setlist.id})});
  entries.push({path:'setlist.json',data:jsonBytes(setlist)});
  for(const id of ids){const track=await repositoryOverride.tracks.get(id);if(!track)throw Error(`Cannot export missing Track ${id}.`);const base=`tracks/${id}`,originalName=`media/original${extension(track.originalAssetPath)}`,portable={...track,packageOriginalPath:originalName,packageStems:{}};delete portable.originalAssetPath;delete portable.stems;
    entries.push({path:`${base}/track.json`,data:jsonBytes(portable)});entries.push({path:`${base}/${originalName}`,data:await readFile(track.originalAssetPath)});
    if(complete(track))for(const stem of STEMS){const name=`media/stems/${stem}${extension(track.stems[stem])}`;portable.packageStems[stem]=name;}
    if(complete(track)){entries[entries.length-2]={path:`${base}/track.json`,data:jsonBytes(portable)};for(const stem of STEMS)entries.push({path:`${base}/${portable.packageStems[stem]}`,data:await readFile(track.stems[stem])});}
  }
  const blob=await zipEntries(entries);return new File([blob],`${setlist.name.replace(/[^a-z0-9 _-]/gi,'').trim()||'LiveSet'}.liveset`,{type:'application/zip'});
}

export async function importSetlistPackage(file,{repositoryOverride=repository,writeFile=writeOpfsFile,readFile=readOpfsFile,removePath=removeOpfsPath,deleteAssets=deleteTrackAssets}={}){
  if(!file||!file.size||file.size>MAX_ARCHIVE_BYTES)throw Error('The .liveset package is empty or too large.');
  let entries;try{entries=await extractArchive(file);}catch(error){throw Error(`Invalid or corrupt .liveset archive: ${error.message}`);}
  const parsed=validatePackageEntries(entries),jobId=uid(),tempBase=`temp/imports/${jobId}`,createdTracks=[],committedTracks=[],idMap=new Map();
  try{
    for(const {base,track} of parsed.tracks){const existing=await repositoryOverride.tracks.get(track.id),sameOriginal=existing&&existing.originalSize===track.originalSize&&existing.originalFilename===track.originalFilename;if(sameOriginal){idMap.set(track.id,existing.id);continue;}const importedId=existing?uid():track.id,newBase=`tracks/${importedId}`,originalTarget=`${newBase}/original${extension(track.packageOriginalPath)}`;await writeFile(`${tempBase}/${importedId}/original${extension(track.packageOriginalPath)}`,entries[`${base}/${track.packageOriginalPath}`]);const stems={};if(track.stemState==='complete')for(const stem of STEMS){const target=`${newBase}/stems/imported-${jobId}/${stem[0].toUpperCase()+stem.slice(1)}${extension(track.packageStems[stem])}`;await writeFile(`${tempBase}/${importedId}/stems/${stem}${extension(track.packageStems[stem])}`,entries[`${base}/${track.packageStems[stem]}`]);stems[stem]=target;}const {packageOriginalPath,packageStems,...metadata}=track;createdTracks.push({...metadata,id:importedId,originalAssetPath:originalTarget,stems,stemGeneration:track.stemState==='complete'?`imported-${jobId}`:undefined});idMap.set(track.id,importedId);}
    for(const track of createdTracks){const tempOriginal=`${tempBase}/${track.id}/original${extension(track.originalAssetPath)}`;await writeFile(track.originalAssetPath,await readFile(tempOriginal));for(const stem of STEMS)if(track.stems?.[stem])await writeFile(track.stems[stem],await readFile(`${tempBase}/${track.id}/stems/${stem}${extension(track.stems[stem])}`));await repositoryOverride.tracks.put(track);committedTracks.push(track);}
    const setlistId=await repositoryOverride.setlists.get(parsed.setlist.id)?uid():parsed.setlist.id,importedSetlist={...parsed.setlist,id:setlistId,name:await repositoryOverride.setlists.get(parsed.setlist.id)?`${parsed.setlist.name} (Imported)`:parsed.setlist.name,items:parsed.setlist.items.map(item=>item.type==='track'?{...item,trackId:idMap.get(item.trackId)}:{...item}),updatedAt:new Date().toISOString()};await repositoryOverride.setlists.put(importedSetlist);await removePath(tempBase,{recursive:true});return {setlist:importedSetlist,tracks:createdTracks,reusedTrackCount:parsed.tracks.length-createdTracks.length};
  }catch(error){for(const track of committedTracks){await repositoryOverride.tracks.delete(track.id).catch(()=>{});await deleteAssets(track.id).catch(()=>{});}await removePath(tempBase,{recursive:true}).catch(()=>{});throw error;}
}
