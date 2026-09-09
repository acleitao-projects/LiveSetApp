import test from 'node:test';
import assert from 'node:assert/strict';
import {wavFixture} from './fixtures.mjs';
import {parsePcmWavHeader,fillStemPacket,packetByteLength,validateStemHeaders,stemGainTargets,STEM_HIGH_WATER_SECONDS,STEM_PACKET_SECONDS} from '../src/stem-pcm.js';
import {STEMS} from '../src/models.js';

function preparedSet({seconds=2,impulseFrame=1000}={}){
  const chunks={},headers={};
  STEMS.forEach((stem,index)=>{const wav=wavFixture(seconds,110+index*55,{impulseFrame});headers[stem]=parsePcmWavHeader(wav.buffer);chunks[stem]=wav.buffer.slice(headers[stem].dataOffset);});
  return {chunks,headers};
}

test('five PCM WAV headers validate to one sample-aligned timeline',()=>{
  const {headers}=preparedSet();const result=validateStemHeaders(headers,8000);
  assert.equal(result.frameCount,16000);assert.equal(result.durationSeconds,2);
  assert.throws(()=>validateStemHeaders({...headers,other:{...headers.other,frameCount:15998}},8000),/sample-aligned/);
  assert.throws(()=>validateStemHeaders({...headers,drums:undefined},8000),/Missing drums/);
});

test('one atomic packet preserves identical impulse frame across all five outputs',()=>{
  const frameCount=16000,{chunks,headers}=preparedSet({impulseFrame:1000});
  const packet=fillStemPacket(new ArrayBuffer(packetByteLength(frameCount)),chunks,headers,frameCount),pcm=new Float32Array(packet),positions=[];
  for(let stem=0;stem<5;stem++){const channel=pcm.subarray(stem*2*frameCount,stem*2*frameCount+frameCount);let max=0,index=0;for(let i=0;i<channel.length;i++)if(Math.abs(channel[i])>max){max=Math.abs(channel[i]);index=i;}positions.push(index);}
  assert.deepEqual(positions,[1000,1000,1000,1000,1000]);
});

test('transferable packet changes ownership without cloning and high-water pool is bounded',()=>{
  const packet=new ArrayBuffer(128),moved=structuredClone({packet},{transfer:[packet]});
  assert.equal(packet.byteLength,0);assert.equal(moved.packet.byteLength,128);
  assert.equal(STEM_HIGH_WATER_SECONDS/STEM_PACKET_SECONDS,24);
});

test('worklet render source contains no filesystem, fetch, decode, await, or packet allocation',async()=>{
  const source=await (await import('node:fs/promises')).readFile(new URL('../src/stem-player-worklet.js',import.meta.url),'utf8');
  const processBody=source.slice(source.indexOf('process(inputs,outputs)'));
  for(const forbidden of ['navigator.storage','fetch(','decodeAudioData','await ','new ArrayBuffer'])assert.equal(processBody.includes(forbidden),false,forbidden);
});

test('multiple Solo selections define the audible group and Mute overrides Solo',()=>{
  const targets=stemGainTargets({vocals:false,guitar:true,bass:false,drums:false,other:false},{vocals:true,guitar:true,bass:false,drums:false,other:false});
  assert.deepEqual(targets,{vocals:1,guitar:0,bass:0,drums:0,other:0});
  assert.deepEqual(stemGainTargets({},{drums:false}),{vocals:1,guitar:1,bass:1,drums:1,other:1});
});
