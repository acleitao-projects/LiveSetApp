import {newTrack,trackItem} from './models.js?v=2';
import {repository,probeAudioFile,writeAsset,deleteTrackAssets} from './storage.js?v=2';

export const emptyTrackDraft=()=>({
  sourceKind:null,
  trackId:null,
  file:null,
  originalFilename:'',
  originalMimeType:'',
  originalSize:0,
  durationSeconds:0,
  title:'',
  artist:'',
  genre:'',
  cifraSource:'',
  dirty:false,
  saved:false,
  status:'empty'
});

export function normalizeTrack(track){
  const defaults=newTrack({id:track.id,createdAt:track.createdAt});
  return {
    ...defaults,
    ...track,
    stems:{...defaults.stems,...(track.stems||{})},
    performance:{
      ...defaults.performance,
      ...(track.performance||{}),
      stemMute:{...defaults.performance.stemMute,...(track.performance?.stemMute||{})},
      stemSolo:{...defaults.performance.stemSolo,...(track.performance?.stemSolo||{})}
    },
    cifraSource:typeof track.cifraSource==='string'?track.cifraSource:''
  };
}

const searchable=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();

export function searchTracks(tracks,query,limit=50){
  const needle=searchable(query.trim());
  if(!needle)return [];
  return tracks.map(track=>{
    const title=searchable(track.title),artist=searchable(track.artist),filename=searchable(track.originalFilename);
    let score=99;
    if(title===needle)score=0;else if(title.startsWith(needle))score=1;else if(title.includes(needle))score=2;else if(artist.startsWith(needle))score=3;else if(artist.includes(needle))score=4;else if(filename.includes(needle))score=5;
    return {track,score};
  }).filter(result=>result.score<99).sort((a,b)=>a.score-b.score||a.track.title.localeCompare(b.track.title)).slice(0,limit).map(result=>result.track);
}

export function searchLibraryTracks(tracks,query,limit=50){
  const needle=searchable(query.trim());
  return tracks.filter(track=>!needle||searchable(track.title).includes(needle)||searchable(track.artist).includes(needle)).sort((a,b)=>a.title.localeCompare(b.title)).slice(0,limit);
}

export function hasCompleteStemSet(track){
  return track?.stemState==='complete'&&['vocals','guitar','bass','drums','other'].every(stem=>typeof track.stems?.[stem]==='string'&&track.stems[stem].length>0);
}

export class TrackService{
  constructor(dependencies={}){
    this.repository=dependencies.repository||repository;
    this.probe=dependencies.probeAudioFile||probeAudioFile;
    this.writeAsset=dependencies.writeAsset||writeAsset;
    this.deleteAssets=dependencies.deleteTrackAssets||deleteTrackAssets;
  }

  async listTracks(){return (await this.repository.tracks.all()).map(normalizeTrack);}

  async loadTrackDraft(trackId){
    const stored=await this.repository.tracks.get(trackId);
    if(!stored)throw Error('Track not found.');
    const track=normalizeTrack(stored);
    return {
      sourceKind:'existing',trackId:track.id,file:null,
      originalFilename:track.originalFilename,originalMimeType:track.originalMimeType,
      originalSize:track.originalSize,durationSeconds:track.durationSeconds,
      title:track.title,artist:track.artist,genre:track.genre,
      cifraSource:track.cifraSource,dirty:false,saved:true,status:'ready'
    };
  }

  async probeExternalFile(file){
    const result=await this.probe(file);
    return {
      sourceKind:'external',trackId:null,file:result.file,
      originalFilename:result.filename,originalMimeType:result.mimeType,
      originalSize:result.size,durationSeconds:result.durationSeconds,
      title:result.title,artist:'',genre:'',cifraSource:'',dirty:true,saved:false,status:'ready'
    };
  }

  async saveTrackDraft(draft){
    if(!draft?.sourceKind)throw Error('Choose a song before saving.');
    if(!draft.title.trim())throw Error('Song name is required.');
    if(draft.sourceKind==='existing'){
      const stored=await this.repository.tracks.get(draft.trackId);
      if(!stored)throw Error('Track not found.');
      const updated={...normalizeTrack(stored),title:draft.title.trim(),artist:draft.artist.trim(),genre:draft.genre.trim(),cifraSource:draft.cifraSource,updatedAt:new Date().toISOString()};
      await this.repository.tracks.put(updated);
      return updated;
    }
    if(!draft.file)throw Error('The selected audio file is unavailable. Choose it again.');
    const track=newTrack({title:draft.title.trim(),artist:draft.artist.trim(),genre:draft.genre.trim(),cifraSource:draft.cifraSource,originalFilename:draft.originalFilename,originalMimeType:draft.originalMimeType,originalSize:draft.originalSize,durationSeconds:draft.durationSeconds});
    try{
      track.originalAssetPath=await this.writeAsset(draft.file,track.id);
      await this.repository.tracks.put(track);
      return track;
    }catch(error){
      await this.deleteAssets(track.id).catch(()=>{});
      throw error;
    }
  }

  async addTrackReferencesToSetlists(trackId,setlistIds){
    const track=await this.repository.tracks.get(trackId);
    if(!track)throw Error('Save the track before adding it to a set list.');
    const updated=[];
    for(const setlistId of [...new Set(setlistIds)]){
      const setlist=await this.repository.setlists.get(setlistId);
      if(!setlist)throw Error('A selected set list no longer exists.');
      const next={...structuredClone(setlist),items:[...setlist.items,trackItem(trackId)],updatedAt:new Date().toISOString()};
      await this.repository.setlists.put(next);
      updated.push(next);
    }
    return updated;
  }

  async saveStemMix(trackId,stemMute,stemSolo){
    const stored=await this.repository.tracks.get(trackId);if(!stored)throw Error('Track not found.');
    const track=normalizeTrack(stored);
    track.performance.stemMute=Object.fromEntries(Object.keys(track.performance.stemMute).map(stem=>[stem,!!stemMute[stem]]));
    track.performance.stemSolo=Object.fromEntries(Object.keys(track.performance.stemSolo).map(stem=>[stem,!!stemSolo[stem]]));
    track.updatedAt=new Date().toISOString();await this.repository.tracks.put(track);return track;
  }
  async saveCifraScrollSpeed(trackId,speed){
    const track=normalizeTrack(await this.repository.tracks.get(trackId));if(!track?.id)throw Error('Track not found.');
    track.performance.cifraScrollSpeed=Math.max(0,Math.min(5,Number(speed)||0));track.updatedAt=new Date().toISOString();await this.repository.tracks.put(track);return track;
  }
  async saveCifraScrollSettings(trackId,{speed,enabled}){
    const track=normalizeTrack(await this.repository.tracks.get(trackId));if(!track?.id)throw Error('Track not found.');
    track.performance.cifraScrollSpeed=Math.max(0,Math.min(5,Number(speed)||0));
    track.performance.cifraAutoScrollEnabled=!!enabled;
    track.updatedAt=new Date().toISOString();await this.repository.tracks.put(track);return track;
  }
}
