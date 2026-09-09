import test from 'node:test';
import assert from 'node:assert/strict';
import {isMp3File,parseId3Tag,readMp3Metadata,rewriteMp3Metadata} from '../src/id3.js';

const encoder=new TextEncoder();

function syncSafe(value){return new Uint8Array([(value>>>21)&0x7f,(value>>>14)&0x7f,(value>>>7)&0x7f,value&0x7f]);}
function uint32(value){return new Uint8Array([(value>>>24)&0xff,(value>>>16)&0xff,(value>>>8)&0xff,value&0xff]);}
function concat(...parts){const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;}
function v23Frame(id,body){return concat(encoder.encode(id),uint32(body.length),new Uint8Array(2),body);}
function utf16le(value){
  const bytes=new Uint8Array(2+value.length*2);bytes[0]=0xff;bytes[1]=0xfe;
  for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);bytes[2+i*2]=code&0xff;bytes[3+i*2]=code>>>8;}
  return bytes;
}

function namedBlob(parts,name,type='audio/mpeg'){
  const blob=new Blob(parts,{type});
  Object.defineProperty(blob,'name',{value:name});
  return blob;
}

test('detects MP3 files by extension or MIME type',()=>{
  assert.equal(isMp3File({name:'song.MP3',type:''}),true);
  assert.equal(isMp3File({name:'song.bin',type:'audio/mpeg'}),true);
  assert.equal(isMp3File({name:'song.wav',type:'audio/wav'}),false);
});

test('reads empty metadata when an MP3 has no ID3v2 tag',async()=>{
  const file=namedBlob([new Uint8Array([0xff,0xfb,0x90,0x64])],'plain.mp3');
  assert.deepEqual(await readMp3Metadata(file),{title:'',artist:'',lyrics:'',audioOffset:0,major:0,frames:[]});
});

test('refuses to rewrite a truncated ID3 tag',async()=>{
  const header=concat(encoder.encode('ID3'),new Uint8Array([4,0,0]),syncSafe(5000));
  const file=namedBlob([header,new Uint8Array([1,2,3])],'broken.mp3');
  await assert.rejects(()=>rewriteMp3Metadata(file,{title:'No',artist:'No',lyrics:'No'}),/truncated/);
});

test('writes and reimports UTF-8 title, artist, and lyrics without changing audio bytes',async()=>{
  const audio=new Uint8Array([0xff,0xfb,0x90,0x64,1,2,3,4,5]);
  const source=namedBlob([audio],'source.mp3');
  const rewritten=await rewriteMp3Metadata(source,{title:'Águas de Março',artist:'Elis & Tom',lyrics:'Am  D7\nÉ pau, é pedra'});
  const parsed=await readMp3Metadata(rewritten);
  assert.equal(parsed.title,'Águas de Março');
  assert.equal(parsed.artist,'Elis & Tom');
  assert.equal(parsed.lyrics,'Am  D7\nÉ pau, é pedra');
  const bytes=new Uint8Array(await rewritten.arrayBuffer());
  assert.deepEqual(bytes.slice(parsed.audioOffset),audio);
});

test('imports common ID3v2.3 UTF-16 metadata',async()=>{
  const title=v23Frame('TIT2',concat(new Uint8Array([1]),utf16le('Title')));
  const artist=v23Frame('TPE1',concat(new Uint8Array([1]),utf16le('Artist')));
  const lyrics=v23Frame('USLT',concat(new Uint8Array([1]),encoder.encode('eng'),new Uint8Array([0xff,0xfe,0,0]),utf16le('Line one\nLine two')));
  const frames=concat(title,artist,lyrics);
  const header=concat(encoder.encode('ID3'),new Uint8Array([3,0,0]),syncSafe(frames.length));
  const file=namedBlob([header,frames,new Uint8Array([0xff,0xfb])],'tagged.mp3');
  const parsed=await readMp3Metadata(file);
  assert.equal(parsed.title,'Title');
  assert.equal(parsed.artist,'Artist');
  assert.equal(parsed.lyrics,'Line one\nLine two');
});

test('a second save replaces editable frames instead of duplicating them',async()=>{
  const source=namedBlob([new Uint8Array([0xff,0xfb,7,8,9])],'source.mp3');
  const first=await rewriteMp3Metadata(source,{title:'Old',artist:'Artist',lyrics:'Old words'});
  const second=await rewriteMp3Metadata(first,{title:'New',artist:'New artist',lyrics:'New words'});
  const bytes=new Uint8Array(await second.arrayBuffer());
  const parsed=parseId3Tag(bytes);
  assert.equal(parsed.title,'New');
  assert.equal(parsed.artist,'New artist');
  assert.equal(parsed.lyrics,'New words');
  assert.equal(parsed.frames.filter(frame=>frame.id==='TIT2').length,1);
  assert.equal(parsed.frames.filter(frame=>frame.id==='TPE1').length,1);
  assert.equal(parsed.frames.filter(frame=>frame.id==='USLT').length,1);
});

test('preserves unrelated uncompressed ID3 frames while updating editable fields',async()=>{
  const albumBody=concat(new Uint8Array([3]),encoder.encode('Preserved album'));
  const album=v23Frame('TALB',albumBody);
  const header=concat(encoder.encode('ID3'),new Uint8Array([3,0,0]),syncSafe(album.length));
  const source=namedBlob([header,album,new Uint8Array([0xff,0xfb,4,5])],'album.mp3');
  const rewritten=await rewriteMp3Metadata(source,{title:'Title',artist:'Artist',lyrics:'Lyrics'});
  const parsed=await readMp3Metadata(rewritten);
  const preserved=parsed.frames.find(frame=>frame.id==='TALB');
  assert.ok(preserved);
  assert.deepEqual(preserved.body,albumBody);
});

test('updates legacy ID3v1 title and artist when a legacy tag is present',async()=>{
  const audio=new Uint8Array([0xff,0xfb,1,2]);
  const legacy=new Uint8Array(128);legacy.set(encoder.encode('TAG'));
  const source=namedBlob([audio,legacy],'legacy.mp3');
  const rewritten=await rewriteMp3Metadata(source,{title:'Fresh title',artist:'Fresh artist',lyrics:'Lyrics'});
  const bytes=new Uint8Array(await rewritten.arrayBuffer());
  const tail=bytes.slice(-128);
  assert.equal(new TextDecoder('iso-8859-1').decode(tail.slice(3,14)),'Fresh title');
  assert.equal(new TextDecoder('iso-8859-1').decode(tail.slice(33,45)),'Fresh artist');
});
