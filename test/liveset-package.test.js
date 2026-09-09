import test from 'node:test';
import assert from 'node:assert/strict';
import {strToU8,unzipSync} from '../src/vendor/fflate.js';
import {exportSetlistPackage,importSetlistPackage,validatePackageEntries} from '../src/liveset-package.js';

const json=value=>strToU8(JSON.stringify(value));
function packageEntries({complete=false}={}){
  const id='track-1',track={id,title:'Song',artist:'Artist',originalFilename:'song.mp3',originalSize:3,stemState:complete?'complete':'none',packageOriginalPath:'media/original.mp3',packageStems:{}},entries={
    'manifest.json':json({format:'LiveSet1',formatVersion:1,packageType:'setlist',rootId:'set-1'}),
    'setlist.json':json({id:'set-1',name:'Gig',items:[{id:'item-1',type:'track',trackId:id}]}),
    [`tracks/${id}/track.json`]:null,[`tracks/${id}/media/original.mp3`]:new Uint8Array([1,2,3])
  };
  if(complete)for(const stem of ['vocals','guitar','bass','drums','other']){track.packageStems[stem]=`media/stems/${stem}.m4a`;entries[`tracks/${id}/${track.packageStems[stem]}`]=new Uint8Array([1,2]);}
  entries[`tracks/${id}/track.json`]=json(track);return entries;
}

test('validates original-only and complete five-stem setlist packages',()=>{
  assert.equal(validatePackageEntries(packageEntries()).tracks.length,1);assert.equal(validatePackageEntries(packageEntries({complete:true})).tracks.length,1);
});

test('rejects traversal, unsupported versions and incomplete stem packages',()=>{
  const traversal=packageEntries();traversal['../escape']=new Uint8Array();assert.throws(()=>validatePackageEntries(traversal),/Unsafe package path/);
  const version=packageEntries();version['manifest.json']=json({format:'LiveSet1',formatVersion:2,packageType:'setlist',rootId:'set-1'});assert.throws(()=>validatePackageEntries(version),/Unsupported/);
  const incomplete=packageEntries({complete:true});delete incomplete['tracks/track-1/media/stems/drums.m4a'];assert.throws(()=>validatePackageEntries(incomplete),/incomplete five-stem/);
});

test('exports one portable setlist archive with original and all five stems',async()=>{
  const stems=Object.fromEntries(['vocals','guitar','bass','drums','other'].map(stem=>[stem,`tracks/track-1/stems/${stem}.m4a`])),track={id:'track-1',title:'Song',artist:'Artist',originalFilename:'song.mp3',originalSize:3,originalAssetPath:'tracks/track-1/original.mp3',stemState:'complete',stems,cifraSource:'C   G\nWords',performance:{cifraScrollSpeed:1}};
  const file=await exportSetlistPackage({id:'set-1',name:'Friday Gig',items:[{id:'item-1',type:'track',trackId:track.id},{id:'break-1',type:'break',label:'Break',durationMinutes:10}]},{repositoryOverride:{tracks:{get:async()=>track}},readFile:async path=>new Blob([path.endsWith('.mp3')?new Uint8Array([1,2,3]):new Uint8Array([4,5])])});
  assert.equal(file.name,'Friday Gig.liveset');const entries=unzipSync(new Uint8Array(await file.arrayBuffer())),parsed=validatePackageEntries(entries);assert.equal(parsed.setlist.items[1].durationMinutes,10);assert.equal(parsed.tracks[0].track.cifraSource,'C   G\nWords');assert.equal(Object.keys(parsed.tracks[0].track.packageStems).length,5);
});

test('round-trip import reconstructs setlist, assets and five-stem Track transactionally',async()=>{
  const stems=Object.fromEntries(['vocals','guitar','bass','drums','other'].map(stem=>[stem,`tracks/track-1/stems/${stem}.m4a`])),track={id:'track-1',title:'Song',artist:'Artist',originalFilename:'song.mp3',originalSize:3,originalAssetPath:'tracks/track-1/original.mp3',stemState:'complete',stems,cifraSource:'Am   F\nWords',performance:{cifraScrollSpeed:2}},sourceRepo={tracks:{get:async()=>track}};
  const exported=await exportSetlistPackage({id:'set-1',name:'Gig',items:[{id:'item-1',type:'track',trackId:'track-1'}]},{repositoryOverride:sourceRepo,readFile:async path=>new Blob([path.endsWith('.mp3')?new Uint8Array([1,2,3]):new Uint8Array([4,5])])});
  const tracks=new Map(),setlists=new Map(),files=new Map(),repo={tracks:{get:async id=>tracks.get(id),put:async value=>(tracks.set(value.id,value),value),delete:async id=>tracks.delete(id)},setlists:{get:async id=>setlists.get(id),put:async value=>(setlists.set(value.id,value),value)}};
  const result=await importSetlistPackage(exported,{repositoryOverride:repo,writeFile:async(path,data)=>(files.set(path,data),path),readFile:async path=>files.get(path),removePath:async()=>{},deleteAssets:async()=>{}});
  assert.equal(result.setlist.id,'set-1');assert.equal(result.tracks.length,1);assert.equal(tracks.get('track-1').cifraSource,'Am   F\nWords');assert.equal(Object.keys(tracks.get('track-1').stems).length,5);assert.equal(files.has('tracks/track-1/original.mp3'),true);
});

test('import reuses confidently matching Track without writing duplicate media',async()=>{
  const entries=packageEntries(),archive=new File([await import('../src/vendor/fflate.js').then(({zipSync})=>zipSync(entries))],'reuse.liveset'),existing={id:'track-1',originalFilename:'song.mp3',originalSize:3},tracks=new Map([['track-1',existing]]),setlists=new Map(),writes=[];
  const repo={tracks:{get:async id=>tracks.get(id),put:async value=>(tracks.set(value.id,value),value),delete:async()=>{}},setlists:{get:async id=>setlists.get(id),put:async value=>(setlists.set(value.id,value),value)}};
  const result=await importSetlistPackage(archive,{repositoryOverride:repo,writeFile:async(...args)=>writes.push(args),readFile:async()=>null,removePath:async()=>{},deleteAssets:async()=>{}});
  assert.equal(result.reusedTrackCount,1);assert.equal(result.tracks.length,0);assert.equal(writes.length,0);assert.equal(result.setlist.items[0].trackId,'track-1');
});
