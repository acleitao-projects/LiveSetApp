import * as ort from '../qualification/vendor/ort.webgpu.min.mjs';
import {STEM_MODEL} from './stem-model-manifest.js?v=1';
import {createM4aEncoder,decodeAudioRange,inspectAudio} from './m4a-media.js?v=1';

const CANONICAL=['vocals','guitar','bass','drums','other'],MODEL_ORDER=['drums','bass','other','vocals','guitar','piano'];
const TARGET_RATE=48000,MODEL_RATE=44100,N=STEM_MODEL.chunkFrames,OVERLAP=STEM_MODEL.overlapFrames,STRIDE=N-OVERLAP;
let cancelledJob=null;

function status(jobId,state,progress,detail=''){postMessage({type:'status',jobId,state,progress,detail});}
function assertActive(jobId){if(cancelledJob===jobId)throw new DOMException('Separation cancelled.','AbortError');}
async function opfsFile(path){const parts=path.split('/').filter(Boolean),name=parts.pop();let directory=await navigator.storage.getDirectory();directory=await directory.getDirectoryHandle('liveset');for(const part of parts)directory=await directory.getDirectoryHandle(part);return (await directory.getFileHandle(name)).getFile();}
async function tempDirectory(jobId){let directory=await navigator.storage.getDirectory();directory=await directory.getDirectoryHandle('liveset',{create:true});for(const part of ['temp','splits',jobId])directory=await directory.getDirectoryHandle(part,{create:true});return directory;}
function windowAt(index){if(index<OVERLAP)return index/Math.max(1,OVERLAP-1);if(index>=N-OVERLAP)return (N-1-index)/Math.max(1,OVERLAP-1);return 1;}
async function readSegment(file,header,start,count){
  const actual=Math.max(0,Math.min(count,header.modelFrames-start)),startSeconds=start/MODEL_RATE,endSeconds=(start+actual+2)/MODEL_RATE,decoded=await decodeAudioRange(file,startSeconds,endSeconds),output=new Float32Array(2*N),sourceStartFrame=Math.round(decoded.firstTimestamp*decoded.sampleRate);
  for(let frame=0;frame<actual;frame++){const sourcePosition=(start+frame)/MODEL_RATE*decoded.sampleRate-sourceStartFrame,index=Math.max(0,Math.min(decoded.left.length-1,Math.floor(sourcePosition))),next=Math.min(decoded.left.length-1,index+1),fraction=Math.max(0,Math.min(1,sourcePosition-index));for(let channel=0;channel<2;channel++){const samples=channel?decoded.right:decoded.left,value=samples[index]*(1-fraction)+samples[next]*fraction;output[channel*N+frame]=Number.isFinite(value)?value:0;}}return output;
}
function mappedValue(data,stem,channel,frame){const index=name=>data[(MODEL_ORDER.indexOf(name)*2+channel)*N+frame];if(stem==='other')return index('other')+index('piano');return index(stem);}
function renderEmission(data,pending,pendingWeight,chunkIndex,emitFrames){
  const stems=Object.fromEntries(CANONICAL.map(stem=>[stem,[new Float32Array(emitFrames),new Float32Array(emitFrames)]]));
  for(let frame=0;frame<emitFrames;frame++){const weight=windowAt(frame),priorWeight=chunkIndex&&frame<OVERLAP?pendingWeight[frame]:0,total=Math.max(1e-8,weight+priorWeight);for(const stem of CANONICAL)for(let channel=0;channel<2;channel++){const prior=chunkIndex&&frame<OVERLAP?pending[stem][channel][frame]:0;stems[stem][channel][frame]=(prior+mappedValue(data,stem,channel,frame)*weight)/total;}}
  const next=Object.fromEntries(CANONICAL.map(stem=>[stem,[new Float32Array(OVERLAP),new Float32Array(OVERLAP)]])),nextWeight=new Float32Array(OVERLAP);
  for(let frame=0;frame<OVERLAP;frame++){const source=STRIDE+frame,weight=windowAt(source);nextWeight[frame]=weight;for(const stem of CANONICAL)for(let channel=0;channel<2;channel++)next[stem][channel][frame]=mappedValue(data,stem,channel,source)*weight;}
  return {stems,next,nextWeight};
}
function resampleForEncoding(channels,sourceStart,outputStart,outputEnd){const frames=outputEnd-outputStart,left=new Float32Array(frames),right=new Float32Array(frames);let peak=0,invalid=0;for(let output=0;output<frames;output++){const globalOutput=outputStart+output,position=globalOutput*MODEL_RATE/TARGET_RATE-sourceStart,index=Math.max(0,Math.min(channels[0].length-1,Math.floor(position))),next=Math.min(channels[0].length-1,index+1),fraction=Math.max(0,Math.min(1,position-index));for(let channel=0;channel<2;channel++){let value=channels[channel][index]*(1-fraction)+channels[channel][next]*fraction;if(!Number.isFinite(value)){invalid++;value=0;}peak=Math.max(peak,Math.abs(value));value=Math.max(-1,Math.min(1,value));(channel?right:left)[output]=value;}}return {left,right,peak,invalid,frames};}

async function separate(message){
  const {jobId}=message;cancelledJob=null;status(jobId,'preparing',0.01,'Opening source audio');
  const source=message.file||await opfsFile(message.sourceAssetPath),sourceInfo=await inspectAudio(source),header={sampleRate:sourceInfo.sampleRate,frames:sourceInfo.frameCount,modelFrames:Math.round(sourceInfo.duration*MODEL_RATE)};assertActive(jobId);
  const estimate=await navigator.storage.estimate(),outputFrames=Math.round(header.modelFrames*TARGET_RATE/MODEL_RATE),required=Math.ceil(outputFrames/TARGET_RATE*128000/8)*5;if((estimate.quota||0)-(estimate.usage||0)<required*2.2)throw Error('Insufficient local storage for temporary and committed five-stem generations.');
  status(jobId,'loading-model',0.04,'Loading verified model');const modelFile=await opfsFile(STEM_MODEL.opfsPath);let modelBytes=await modelFile.arrayBuffer();assertActive(jobId);
  const session=await ort.InferenceSession.create(modelBytes,{executionProviders:['webgpu'],preferredOutputLocation:{stems:'gpu-buffer'}});modelBytes=null;assertActive(jobId);
  const directory=await tempDirectory(jobId),encoders={};for(const stem of CANONICAL){const filename=`${stem[0].toUpperCase()}${stem.slice(1)}.m4a`,handle=await directory.getFileHandle(filename,{create:true});encoders[stem]=await createM4aEncoder(handle);}
  const chunkCount=Math.max(1,Math.ceil(header.modelFrames/STRIDE));let pending=Object.fromEntries(CANONICAL.map(stem=>[stem,[new Float32Array(OVERLAP),new Float32Array(OVERLAP)]])),pendingWeight=new Float32Array(OVERLAP),writtenFrames=0,peak=0,invalidSamples=0,invalidContext='';
  try{
    for(let chunkIndex=0;chunkIndex<chunkCount;chunkIndex++){
      assertActive(jobId);const sourceStart=chunkIndex*STRIDE,remaining=header.modelFrames-sourceStart,emitFrames=Math.min(STRIDE,remaining);status(jobId,'running',0.08+0.72*chunkIndex/chunkCount,`Separating chunk ${chunkIndex+1} of ${chunkCount}`);
      const input=await readSegment(source,header,sourceStart,N),inputTensor=new ort.Tensor('float32',input,[1,2,N]);let outputs;try{outputs=await session.run({mix:inputTensor});}finally{inputTensor.dispose?.();}assertActive(jobId);const data=await outputs.stems.getData(true),rendered=renderEmission(data,pending,pendingWeight,chunkIndex,emitFrames);pending=rendered.next;pendingWeight=rendered.nextWeight;
      const targetEnd=Math.round((sourceStart+emitFrames)*TARGET_RATE/MODEL_RATE);
      for(const stem of CANONICAL){const encoded=resampleForEncoding(rendered.stems[stem],sourceStart,writtenFrames,targetEnd);peak=Math.max(peak,encoded.peak);if(encoded.invalid&&!invalidContext)invalidContext=`chunk ${chunkIndex+1}, ${stem}`;invalidSamples+=encoded.invalid;await encoders[stem].add(encoded.left,encoded.right,writtenFrames);}
      writtenFrames=targetEnd;outputs.stems.dispose?.();
    }
    status(jobId,'encoding-writing',0.83,'Finalizing five AAC-LC M4A files');for(const stem of CANONICAL)await encoders[stem].finalize();
    if(invalidSamples||!writtenFrames)throw Error(`Generated stems contain ${invalidSamples} invalid samples${invalidContext?` beginning at ${invalidContext}`:''}.`);status(jobId,'validating',0.92,'Validating generated files');
    const checks=[];for(const stem of CANONICAL){const filename=`${stem[0].toUpperCase()}${stem.slice(1)}.m4a`,file=await (await directory.getFileHandle(filename)).getFile(),check=await inspectAudio(file,{requireAac:true});if(Math.abs(check.frameCount-writtenFrames)>2048)throw Error(`${stem} stem duration validation failed.`);checks.push({stem,size:file.size,...check});}
    if(Math.max(...checks.map(check=>check.frameCount))-Math.min(...checks.map(check=>check.frameCount))>1)throw Error('Encoded stem durations are not sample-aligned.');
    await session.release();status(jobId,'validating',0.95,'Five temporary stems validated');postMessage({type:'complete',jobId,frameCount:writtenFrames,sampleRate:TARGET_RATE,durationSeconds:writtenFrames/TARGET_RATE,peak});
  }catch(error){for(const encoder of Object.values(encoders))await encoder.cancel?.().catch(()=>{});await session.release().catch(()=>{});throw error;}
}

self.onmessage=({data})=>{if(data.type==='cancel'){cancelledJob=data.jobId;return;}if(data.type==='start')separate(data).catch(error=>postMessage({type:'error',jobId:data.jobId,name:error.name,message:error.message||String(error),stack:error.stack||''}));};
