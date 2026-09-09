import {AudioSample,AudioSampleSink,AudioSampleSource,ALL_FORMATS,BlobSource,Input,Mp4OutputFormat,Output,Quality,StreamTarget,canEncodeAudio} from './vendor/mediabunny.min.mjs';

export const STEM_AAC_BITRATE=128000;
export const STEM_SAMPLE_RATE=48000;
export const STEM_CHANNELS=2;

function opfsTarget(writable){
  return new StreamTarget(new WritableStream({
    async write({data,position}){await writable.write({type:'write',position,data});},
    async close(){await writable.close();},
    async abort(reason){await writable.abort(reason);}
  }),{chunked:true,chunkSize:1024*1024});
}

export async function assertNativeAacEncoding(){
  if(typeof AudioEncoder==='undefined'||!await canEncodeAudio('aac',{sampleRate:STEM_SAMPLE_RATE,numberOfChannels:STEM_CHANNELS,bitrate:STEM_AAC_BITRATE}))throw Error('AAC-LC encoding is unavailable on this device. LiveSet does not use a CPU codec fallback.');
}

export async function createM4aEncoder(fileHandle){
  await assertNativeAacEncoding();
  const writable=await fileHandle.createWritable(),output=new Output({format:new Mp4OutputFormat(),target:opfsTarget(writable)}),source=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:STEM_AAC_BITRATE,bitrateMode:'constant'}),fullCodecString:'mp4a.40.2'});
  output.addAudioTrack(source,{name:'LiveSet stem'});await output.start();
  return {
    async add(left,right,timestampFrames){
      const frames=left.length,data=new Float32Array(frames*2);data.set(left);data.set(right,frames);
      const sample=new AudioSample({data,format:'f32-planar',numberOfChannels:2,sampleRate:STEM_SAMPLE_RATE,timestamp:timestampFrames/STEM_SAMPLE_RATE});
      try{await source.add(sample);}finally{sample.close();}
    },
    finalize:()=>output.finalize(),cancel:()=>output.cancel()
  };
}

export async function inspectAudio(file,{requireAac=false}={}){
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  try{
    if(!await input.canRead())throw Error('Audio container is not readable.');
    const track=await input.getPrimaryAudioTrack();if(!track)throw Error('Audio file has no audio track.');
    const [codec,sampleRate,channels,duration]=await Promise.all([track.getCodec(),track.getSampleRate(),track.getNumberOfChannels(),track.computeDuration()]);
    if(requireAac&&codec!=='aac')throw Error(`Stem codec must be AAC-LC, received ${codec||'unknown'}.`);
    if(requireAac&&sampleRate!==STEM_SAMPLE_RATE)throw Error(`Stem sample rate must be ${STEM_SAMPLE_RATE} Hz.`);
    if(requireAac&&channels!==STEM_CHANNELS)throw Error('Stem channel layout must be stereo.');
    return {codec,sampleRate,channels,duration,frameCount:Math.round(duration*sampleRate),mimeType:await input.getMimeType()};
  }finally{input.dispose();}
}

export async function decodeAudioRange(file,startSeconds,endSeconds){
  const input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});
  try{
    const track=await input.getPrimaryAudioTrack();if(!track||!await track.canDecode())throw Error('This audio format cannot be decoded on this device.');
    const sampleRate=await track.getSampleRate(),channels=await track.getNumberOfChannels(),left=[],right=[];let firstTimestamp=null;
    const sink=new AudioSampleSink(track);
    for await(const sample of sink.samples(startSeconds,endSeconds)){
      if(firstTimestamp===null)firstTimestamp=sample.timestamp;const count=sample.numberOfFrames,l=new Float32Array(count),r=new Float32Array(count);sample.copyTo(l,{planeIndex:0,format:'f32-planar'});sample.copyTo(r,{planeIndex:Math.min(1,sample.numberOfChannels-1),format:'f32-planar'});left.push(l);right.push(r);sample.close();
    }
    const join=arrays=>{const total=arrays.reduce((sum,value)=>sum+value.length,0),out=new Float32Array(total);let at=0;for(const value of arrays){out.set(value,at);at+=value.length;}return out;};
    return {sampleRate,channels,firstTimestamp:firstTimestamp??startSeconds,left:join(left),right:join(right)};
  }finally{input.dispose();}
}
