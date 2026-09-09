import {STEMS} from './models.js?v=2';
import {packetByteLength,STEM_OUTPUT_CHANNELS} from './stem-pcm.js?v=2';
import {ALL_FORMATS,AudioSampleSink,BlobSource,Input} from './vendor/mediabunny.min.mjs';

let active=null,work=Promise.resolve();

async function opfsFile(path){const parts=path.split('/').filter(Boolean);let directory=await navigator.storage.getDirectory();directory=await directory.getDirectoryHandle('liveset');for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part);return (await directory.getFileHandle(parts.at(-1))).getFile();}

async function openStem(file,expectedRate){
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS}),track=await input.getPrimaryAudioTrack();
  if(!track||await track.getCodec()!=='aac')throw Error('Stem is not an AAC-LC M4A asset.');
  const [sampleRate,channels,duration]=await Promise.all([track.getSampleRate(),track.getNumberOfChannels(),track.computeDuration()]);
  if(sampleRate!==expectedRate||channels!==2)throw Error('Stem sample rate or channel layout is incompatible with this audio device.');
  return {input,sink:new AudioSampleSink(track),sampleRate,channels,frameCount:Math.round(duration*sampleRate),duration};
}

async function prepare(message){
  active?.inputs?.forEach(value=>value.input.dispose());
  const inputs=[];for(const stem of STEMS)inputs.push(await openStem(await opfsFile(message.stems[stem]),message.sampleRate));
  const counts=inputs.map(value=>value.frameCount);if(Math.max(...counts)-Math.min(...counts)>1){inputs.forEach(value=>value.input.dispose());throw Error('Stem durations are not sample-aligned.');}
  const frameCount=Math.min(...counts);active={generation:message.generation,inputs,frameCount,nextFrame:message.startFrame||0,packetFrames:message.packetFrames,sampleRate:message.sampleRate};
  postMessage({type:'prepared',generation:active.generation,sampleRate:message.sampleRate,frameCount,durationSeconds:frameCount/message.sampleRate});
}

async function decodeInto(state,stemIndex,startFrame,frameCount,output){
  const item=state.inputs[stemIndex],start=startFrame/state.sampleRate,end=(startFrame+frameCount)/state.sampleRate,stemOffset=stemIndex*STEM_OUTPUT_CHANNELS*state.packetFrames;
  for await(const sample of item.sink.samples(start,end)){
    const sampleStart=Math.round(sample.timestamp*state.sampleRate),from=Math.max(startFrame,sampleStart),to=Math.min(startFrame+frameCount,sampleStart+sample.numberOfFrames);
    if(to>from){const count=to-from,sourceOffset=from-sampleStart,targetOffset=from-startFrame,left=new Float32Array(count),right=new Float32Array(count);sample.copyTo(left,{planeIndex:0,format:'f32-planar',frameOffset:sourceOffset,frameCount:count});sample.copyTo(right,{planeIndex:1,format:'f32-planar',frameOffset:sourceOffset,frameCount:count});output.set(left,stemOffset+targetOffset);output.set(right,stemOffset+state.packetFrames+targetOffset);}
    sample.close();
  }
}

async function fill(message){
  const state=active;if(!state||message.generation!==state.generation)return postMessage({type:'buffer-return',generation:message.generation,buffer:message.buffer},[message.buffer]);
  const startFrame=state.nextFrame;if(startFrame>=state.frameCount)return postMessage({type:'eof',generation:state.generation,buffer:message.buffer},[message.buffer]);
  const frameCount=Math.min(state.packetFrames,state.frameCount-startFrame),required=packetByteLength(state.packetFrames);let buffer=message.buffer;if(!buffer||buffer.byteLength!==required)buffer=new ArrayBuffer(required);const output=new Float32Array(buffer);output.fill(0);
  for(let index=0;index<STEMS.length;index++){await decodeInto(state,index,startFrame,frameCount,output);if(!active||active.generation!==state.generation)return postMessage({type:'buffer-return',generation:message.generation,buffer},[buffer]);}
  state.nextFrame+=frameCount;postMessage({type:'packet',generation:state.generation,startFrame,frameCount,channels:2,buffer},[buffer]);
}

self.onmessage=({data})=>{work=work.then(async()=>{try{if(data.type==='prepare')await prepare(data);else if(data.type==='fill')await fill(data);else if(data.type==='cancel'&&active?.generation===data.generation){active.inputs.forEach(value=>value.input.dispose());active=null;}}catch(error){postMessage({type:'error',generation:data.generation,message:error?.message||String(error),buffer:data.buffer},data.buffer?[data.buffer]:[]);}});};
