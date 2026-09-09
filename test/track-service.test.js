import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackService,normalizeTrack,searchTracks,searchLibraryTracks,hasCompleteStemSet} from '../src/track-service.js';
import {newTrack,newSetlist} from '../src/models.js';

function memoryDependencies({failWrite=false}={}){
  const tracks=new Map(),setlists=new Map(),writes=[],deletes=[];
  const repository={
    tracks:{all:async()=>[...tracks.values()],get:async id=>tracks.get(id),put:async value=>(tracks.set(value.id,structuredClone(value)),value)},
    setlists:{all:async()=>[...setlists.values()],get:async id=>setlists.get(id),put:async value=>(setlists.set(value.id,structuredClone(value)),value)}
  };
  return {tracks,setlists,writes,deletes,repository,probeAudioFile:async file=>({file,filename:file.name,mimeType:file.type,size:file.size,durationSeconds:30,title:'fixture'}),writeAsset:async(file,id)=>{writes.push({file,id});if(failWrite)throw Error('write failed');return `tracks/${id}/original.wav`;},deleteTrackAssets:async id=>deletes.push(id)};
}

test('raw cifra is preserved exactly when saving and reopening a new track',async()=>{
  const deps=memoryDependencies();const service=new TrackService(deps);
  const file={name:'fixture.wav',type:'audio/wav',size:100};
  const draft=await service.probeExternalFile(file);
  const exact='[Verse]\r\nAm       F\r\n  lyric\ttext\r\n\r\n';
  draft.cifraSource=exact;
  const saved=await service.saveTrackDraft(draft);
  const reopened=await service.loadTrackDraft(saved.id);
  assert.equal(reopened.cifraSource,exact);
  assert.equal(deps.writes.length,1);
});

test('new file is not persisted before Save Track',async()=>{
  const deps=memoryDependencies();const service=new TrackService(deps);
  await service.probeExternalFile({name:'fixture.wav',type:'audio/wav',size:100});
  assert.equal(deps.tracks.size,0);assert.equal(deps.writes.length,0);
});

test('failed asset write creates no track record and cleans attempted assets',async()=>{
  const deps=memoryDependencies({failWrite:true});const service=new TrackService(deps);
  const draft=await service.probeExternalFile({name:'fixture.wav',type:'audio/wav',size:100});
  await assert.rejects(()=>service.saveTrackDraft(draft),/write failed/);
  assert.equal(deps.tracks.size,0);assert.equal(deps.deletes.length,1);
});

test('editing existing track preserves asset, stems, settings, duration and id',async()=>{
  const deps=memoryDependencies();const service=new TrackService(deps);
  const original=newTrack({title:'Old',durationSeconds:42,cifraSource:'  Am\nline'});
  original.originalAssetPath='tracks/t/original.wav';original.stemState='complete';original.stems={vocals:'v',guitar:'g',bass:'b',drums:'d',other:'o'};original.performance.stemMute.vocals=true;
  deps.tracks.set(original.id,structuredClone(original));
  const draft=await service.loadTrackDraft(original.id);draft.title='New';draft.cifraSource='Am    F\nwords';
  const saved=await service.saveTrackDraft(draft);
  assert.equal(saved.id,original.id);assert.equal(saved.originalAssetPath,original.originalAssetPath);assert.equal(saved.durationSeconds,42);assert.deepEqual(saved.stems,original.stems);assert.equal(saved.performance.stemMute.vocals,true);assert.equal(deps.writes.length,0);
});

test('adding a track to multiple setlists creates references only',async()=>{
  const deps=memoryDependencies();const service=new TrackService(deps);
  const track=newTrack({title:'One'});track.originalAssetPath='tracks/one/original.wav';deps.tracks.set(track.id,structuredClone(track));
  const a=newSetlist('A'),b=newSetlist('B');deps.setlists.set(a.id,a);deps.setlists.set(b.id,b);
  const before=structuredClone(track);const result=await service.addTrackReferencesToSetlists(track.id,[a.id,b.id]);
  assert.equal(result.length,2);assert.equal(result[0].items[0].trackId,track.id);assert.notEqual(result[0].items[0].id,result[1].items[0].id);assert.deepEqual(deps.tracks.get(track.id),before);assert.equal(deps.tracks.size,1);assert.equal(deps.writes.length,0);
});

test('normalization preserves an exact existing cifra string',()=>{
  const exact='\tAm   G\n\n lyric  ';
  assert.equal(normalizeTrack({id:'x',cifraSource:exact}).cifraSource,exact);
});

test('track search scales, ranks title matches, ignores accents and caps results',()=>{
  const library=Array.from({length:1000},(_,index)=>newTrack({id:`track-${index}`,title:`Song ${index}`,artist:index===777?'Tavito':''}));
  library.push(newTrack({id:'special',title:'Rua Ramalhete',artist:'Távito',originalFilename:'ramalhete.wav'}));
  const titleResult=searchTracks(library,'rua');
  assert.equal(titleResult[0].id,'special');
  assert.equal(searchTracks(library,'tavito')[0].id,'special');
  assert.equal(searchTracks(library,'song').length,50);
  assert.deepEqual(searchTracks(library,''),[]);
});

test('library search uses title and artist only with partial case-insensitive matches',()=>{
  const library=[newTrack({id:'one',title:'Rua Ramalhete',artist:'Távito',originalFilename:'hidden-match.wav'}),newTrack({id:'two',title:'Creep',artist:'Radiohead',originalFilename:'rua-file.wav'})];
  assert.deepEqual(searchLibraryTracks(library,'RAMAL').map(track=>track.id),['one']);
  assert.deepEqual(searchLibraryTracks(library,'tavito').map(track=>track.id),['one']);
  assert.deepEqual(searchLibraryTracks(library,'rua-file').map(track=>track.id),[]);
});

test('complete stem badge requires all five canonical stem references',()=>{
  const complete={stemState:'complete',stems:{vocals:'v',guitar:'g',bass:'b',drums:'d',other:'o'}};
  assert.equal(hasCompleteStemSet(complete),true);
  assert.equal(hasCompleteStemSet({...complete,stems:{...complete.stems,other:''}}),false);
  assert.equal(hasCompleteStemSet({...complete,stemState:'none'}),false);
});

test('stem mute and solo settings persist without rewriting Track assets',async()=>{
  const deps=memoryDependencies(),service=new TrackService(deps),track=newTrack({title:'Stems'});track.originalAssetPath='tracks/stems/original.wav';track.stemState='complete';track.stems={vocals:'v',guitar:'g',bass:'b',drums:'d',other:'o'};deps.tracks.set(track.id,structuredClone(track));
  const mute={...track.performance.stemMute,vocals:true},solo={...track.performance.stemSolo,guitar:true};const saved=await service.saveStemMix(track.id,mute,solo);
  assert.equal(saved.performance.stemMute.vocals,true);assert.equal(saved.performance.stemSolo.guitar,true);assert.equal(saved.originalAssetPath,track.originalAssetPath);assert.deepEqual(saved.stems,track.stems);assert.equal(deps.writes.length,0);
});

test('cifra auto-scroll speed persists immediately as a Track preference',async()=>{
  const deps=memoryDependencies(),track=newTrack({title:'Scroll song'});track.originalAssetPath='tracks/scroll/original.mp3';await deps.repository.tracks.put(track);
  const service=new TrackService(deps),saved=await service.saveCifraScrollSpeed(track.id,2.75),reopened=await service.loadTrackDraft(track.id);
  assert.equal(saved.performance.cifraScrollSpeed,2.75);assert.equal((await deps.repository.tracks.get(track.id)).performance.cifraScrollSpeed,2.75);assert.equal(reopened.trackId,track.id);
});

test('cifra auto-scroll enabled state and speed persist together',async()=>{
  const deps=memoryDependencies(),track=newTrack({title:'Auto scroll'});await deps.repository.tracks.put(track);const service=new TrackService(deps);
  const enabled=await service.saveCifraScrollSettings(track.id,{speed:3.5,enabled:true});assert.equal(enabled.performance.cifraScrollSpeed,3.5);assert.equal(enabled.performance.cifraAutoScrollEnabled,true);
  const disabled=await service.saveCifraScrollSettings(track.id,{speed:2,enabled:false});assert.equal(disabled.performance.cifraScrollSpeed,2);assert.equal(disabled.performance.cifraAutoScrollEnabled,false);
});
