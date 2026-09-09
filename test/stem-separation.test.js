import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STEM_MODEL,validateModelManifest} from '../src/stem-model-manifest.js';
import {StemSeparationService} from '../src/stem-separation-service.js';

class FakeWorker{constructor(){this.messages=[];this.terminated=false;}postMessage(value){this.messages.push(value);}terminate(){this.terminated=true;}}
function dependencies({commitFails=false,newTrack=false}={}){
  const worker=new FakeWorker(),deleted=[],assetsDeleted=[],cleaned=[];
  const stored={id:'track-1',stemState:'complete',stems:{vocals:'old-v',guitar:'old-g',bass:'old-b',drums:'old-d',other:'old-o'}};
  const tracks=new Map([[stored.id,structuredClone(stored)]]);
  return {worker,stored,tracks,deleted,assetsDeleted,cleaned,deps:{
    modelAssets:{getCapability:async()=>({supported:true}),getModelState:async()=>({state:'ready'}),verifyModel:async()=>({})},
    workerFactory:()=>worker,
    repository:{tracks:{get:async id=>tracks.get(id),put:async value=>(tracks.set(value.id,value),value),delete:async id=>{deleted.push(id);tracks.delete(id);}}},
    trackService:{saveTrackDraft:async()=>{const value={id:'new-track',stemState:'none',stems:{}};tracks.set(value.id,value);return value;}},
    commitStemGeneration:async id=>{if(commitFails)throw Error('record commit failed');const value={...(tracks.get(id)||{id}),stemState:'complete',stems:{vocals:'v',guitar:'g',bass:'b',drums:'d',other:'o'}};tracks.set(id,value);return value;},
    cleanupSplitJob:async id=>cleaned.push(id),deleteTrackAssets:async id=>assetsDeleted.push(id)
  }};
}

test('qualified model manifest has exact immutable identity and five canonical mapping',()=>{
  assert.equal(validateModelManifest(),true);assert.equal(STEM_MODEL.sha256,'a3f5050696cda4b2344d465123acb21ee699dad7d0634dba1d282497a04ac86a');assert.equal(STEM_MODEL.byteLength,284797240);
  assert.deepEqual(STEM_MODEL.mapping.drums,['drums']);assert.deepEqual(STEM_MODEL.mapping.other,['other','piano']);assert.deepEqual(Object.keys(STEM_MODEL.mapping),['vocals','guitar','bass','drums','other']);
  assert.deepEqual(STEM_MODEL.outputFormat,{container:'m4a',codec:'aac-lc',bitrate:128000,sampleRate:48000,channels:2});
});

test('service commits validated existing-track generation without changing identity',async()=>{
  const fixture=dependencies(),service=new StemSeparationService(fixture.deps);const {jobId}=await service.start({trackId:'track-1',sourceAssetPath:'tracks/track-1/original.wav'}),job=service.jobs.get(jobId);
  await service.handleMessage(job,{type:'complete',jobId,frameCount:48000,sampleRate:48000});
  assert.equal(job.state,'complete');assert.equal(job.trackId,'track-1');assert.equal(fixture.tracks.get('track-1').stemState,'complete');assert.equal(fixture.deleted.length,0);assert.equal(fixture.worker.terminated,true);
});

test('failed new-track stem commit rolls back Track record and original assets',async()=>{
  const fixture=dependencies({commitFails:true}),service=new StemSeparationService(fixture.deps);const {jobId}=await service.start({file:{name:'source.wav'},draft:{sourceKind:'external'}}),job=service.jobs.get(jobId);
  await service.handleMessage(job,{type:'complete',jobId,frameCount:48000,sampleRate:48000});
  assert.equal(job.state,'failed');assert.deepEqual(fixture.deleted,['new-track']);assert.deepEqual(fixture.assetsDeleted,['new-track']);assert.equal(fixture.cleaned.includes(jobId),true);
});

test('separation worker is WebGPU-only and independent from AudioEngine',async()=>{
  const source=await readFile(new URL('../src/stem-separation-worker.js',import.meta.url),'utf8');
  assert.match(source,/executionProviders:\['webgpu'\]/);assert.doesNotMatch(source,/CPUExecutionProvider|AudioEngine|playTrack|audio\.pause|audio\.currentTime/);
  assert.match(source,/temp['"],['"]splits/);assert.match(source,/vocals.*guitar.*bass.*drums.*other/);
  assert.match(source,/\.m4a/);assert.doesNotMatch(source,/\.wav/);assert.match(source,/createM4aEncoder/);
  assert.match(source,/preferredOutputLocation:\{stems:'gpu-buffer'\}/);assert.match(source,/getData\(true\)/);assert.match(source,/modelBytes=null/);assert.match(source,/inputTensor\.dispose/);
});

test('production stem storage uses five canonical M4A names and no WAV copies',async()=>{
  const source=await readFile(new URL('../src/storage.js',import.meta.url),'utf8');
  assert.match(source,/stem\[0\]\.toUpperCase\(\).*\.m4a/);
  assert.doesNotMatch(source,/sourceBase[^\n]+\.wav/);
});

test('128 kbps five-stem storage stays tablet-sized for representative songs',()=>{
  const bytesPerSecond=STEM_MODEL.outputFormat.bitrate/8*5;
  assert.equal(bytesPerSecond*180,14_400_000);assert.equal(bytesPerSecond*240,19_200_000);assert.equal(bytesPerSecond*300,24_000_000);
});
