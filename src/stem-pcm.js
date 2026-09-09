import {STEMS} from './models.js?v=2';

export const STEM_PACKET_SECONDS=0.25;
export const STEM_STARTUP_SECONDS=3;
export const STEM_LOW_WATER_SECONDS=2;
export const STEM_HIGH_WATER_SECONDS=6;
export const STEM_OUTPUT_CHANNELS=2;

export function parsePcmWavHeader(buffer){
  const view=new DataView(buffer);
  const text=(offset,length)=>String.fromCharCode(...new Uint8Array(buffer,offset,length));
  if(buffer.byteLength<44||text(0,4)!=='RIFF'||text(8,4)!=='WAVE')throw Error('Stem is not a valid WAV file.');
  let offset=12,format=null,data=null;
  while(offset+8<=buffer.byteLength){
    const id=text(offset,4),size=view.getUint32(offset+4,true),start=offset+8;
    if(id==='fmt '&&size>=16)format={audioFormat:view.getUint16(start,true),channels:view.getUint16(start+2,true),sampleRate:view.getUint32(start+4,true),blockAlign:view.getUint16(start+12,true),bitsPerSample:view.getUint16(start+14,true)};
    if(id==='data')data={dataOffset:start,dataBytes:size};
    offset=start+size+(size%2);
    if(format&&data)break;
  }
  if(!format||!data)throw Error('Stem WAV is missing format or audio data.');
  if(format.audioFormat!==1||format.bitsPerSample!==16)throw Error('Milestone 3 stem playback requires 16-bit PCM WAV assets.');
  if(![1,2].includes(format.channels))throw Error('Stem WAV must be mono or stereo.');
  if(format.blockAlign!==format.channels*2)throw Error('Stem WAV has an invalid frame layout.');
  return {...format,...data,frameCount:Math.floor(data.dataBytes/format.blockAlign)};
}

export function packetByteLength(frameCount){return STEMS.length*STEM_OUTPUT_CHANNELS*frameCount*Float32Array.BYTES_PER_ELEMENT;}

export function fillStemPacket(targetBuffer,stemChunks,headers,frameCount){
  const output=new Float32Array(targetBuffer);
  const channelStride=frameCount;
  for(let stemIndex=0;stemIndex<STEMS.length;stemIndex++){
    const header=headers[STEMS[stemIndex]],input=new DataView(stemChunks[STEMS[stemIndex]]);
    for(let frame=0;frame<frameCount;frame++){
      const base=frame*header.blockAlign;
      const left=input.getInt16(base,true)/32768;
      const right=header.channels===2?input.getInt16(base+2,true)/32768:left;
      const stemOffset=stemIndex*STEM_OUTPUT_CHANNELS*channelStride;
      output[stemOffset+frame]=left;
      output[stemOffset+channelStride+frame]=right;
    }
  }
  return targetBuffer;
}

export function validateStemHeaders(headers,targetSampleRate){
  for(const stem of STEMS)if(!headers[stem])throw Error(`Missing ${stem} stem.`);
  const first=headers[STEMS[0]];
  for(const stem of STEMS){
    const header=headers[stem];
    if(header.sampleRate!==targetSampleRate)throw Error(`The ${stem} stem sample rate is incompatible with this audio device.`);
    if(Math.abs(header.frameCount-first.frameCount)>1)throw Error('Stem durations are not sample-aligned.');
  }
  return {sampleRate:first.sampleRate,frameCount:Math.min(...STEMS.map(stem=>headers[stem].frameCount)),durationSeconds:Math.min(...STEMS.map(stem=>headers[stem].frameCount))/first.sampleRate};
}

export function stemGainTargets(mutes={},solos={}){const anySolo=STEMS.some(stem=>!!solos[stem]);return Object.fromEntries(STEMS.map(stem=>[stem,!mutes[stem]&&(!anySolo||!!solos[stem])?1:0]));}
