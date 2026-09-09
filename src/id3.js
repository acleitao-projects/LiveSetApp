const TARGET_IDS=new Set(['TIT2','TPE1','USLT','TT2','TP1','ULT']);
const MAX_TAG_BYTES=64*1024*1024;
const PADDING_BYTES=1024;
const encoder=new TextEncoder();

function ascii(bytes,start,length){return String.fromCharCode(...bytes.subarray(start,start+length));}
function syncSafe(bytes,start=0){return ((bytes[start]&0x7f)<<21)|((bytes[start+1]&0x7f)<<14)|((bytes[start+2]&0x7f)<<7)|(bytes[start+3]&0x7f);}
function uint32(bytes,start=0){return (bytes[start]*0x1000000)+((bytes[start+1]<<16)|(bytes[start+2]<<8)|bytes[start+3]);}
function uint24(bytes,start=0){return (bytes[start]<<16)|(bytes[start+1]<<8)|bytes[start+2];}
function syncSafeBytes(value){return new Uint8Array([(value>>>21)&0x7f,(value>>>14)&0x7f,(value>>>7)&0x7f,value&0x7f]);}

function deunsynchronize(bytes){
  const output=[];
  for(let i=0;i<bytes.length;i++){
    output.push(bytes[i]);
    if(bytes[i]===0xff&&bytes[i+1]===0x00)i++;
  }
  return new Uint8Array(output);
}

function decodeUtf16(bytes,bigEndian=false){
  let source=bytes;
  let endian=bigEndian?'be':'le';
  if(source[0]===0xff&&source[1]===0xfe){endian='le';source=source.subarray(2);}
  else if(source[0]===0xfe&&source[1]===0xff){endian='be';source=source.subarray(2);}
  if(endian==='be'){
    const swapped=new Uint8Array(source.length-source.length%2);
    for(let i=0;i<swapped.length;i+=2){swapped[i]=source[i+1];swapped[i+1]=source[i];}
    source=swapped;
  }
  return new TextDecoder('utf-16le').decode(source);
}

function decodeText(bytes,encoding){
  if(!bytes?.length)return '';
  let value='';
  if(encoding===0)value=new TextDecoder('iso-8859-1').decode(bytes);
  else if(encoding===1)value=decodeUtf16(bytes);
  else if(encoding===2)value=decodeUtf16(bytes,true);
  else value=new TextDecoder('utf-8').decode(bytes);
  return value.replace(/^\uFEFF/,'').replace(/\0+$/,'');
}

function terminatorIndex(bytes,encoding,start){
  if(encoding===1||encoding===2){
    for(let i=start;i+1<bytes.length;i+=2)if(bytes[i]===0&&bytes[i+1]===0)return i;
    return bytes.length;
  }
  const found=bytes.indexOf(0,start);
  return found<0?bytes.length:found;
}

function frameText(body){return body?.length?decodeText(body.subarray(1),body[0]):'';}
function lyricsText(body){
  if(!body||body.length<4)return '';
  const encoding=body[0];
  const descriptionStart=4;
  const end=terminatorIndex(body,encoding,descriptionStart);
  const lyricsStart=Math.min(body.length,end+((encoding===1||encoding===2)?2:1));
  return decodeText(body.subarray(lyricsStart),encoding);
}

function parseFrames(tagBytes,major,flags){
  let data=tagBytes;
  if(flags&0x80)data=deunsynchronize(data);
  let offset=0;
  if(flags&0x40){
    if(major===3&&data.length>=4)offset=Math.min(data.length,4+uint32(data,0));
    else if(major===4&&data.length>=4)offset=Math.min(data.length,syncSafe(data,0));
  }
  const frames=[];
  const headerSize=major===2?6:10;
  while(offset+headerSize<=data.length){
    const id=ascii(data,offset,major===2?3:4);
    if(/^\x00+$/.test(id)||!(/^[A-Z0-9]{3,4}$/.test(id)))break;
    const size=major===2?uint24(data,offset+3):(major===4?syncSafe(data,offset+4):uint32(data,offset+4));
    if(size<=0||offset+headerSize+size>data.length)break;
    const frameFlags=major===2?new Uint8Array(2):data.slice(offset+8,offset+10);
    let body=data.slice(offset+headerSize,offset+headerSize+size);
    if(major===4&&(frameFlags[1]&0x02))body=deunsynchronize(body);
    frames.push({id,body,flags:frameFlags});
    offset+=headerSize+size;
  }
  return frames;
}

export function parseId3Tag(bytes){
  const source=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);
  if(source.length<10||ascii(source,0,3)!=='ID3')return {title:'',artist:'',lyrics:'',audioOffset:0,major:0,frames:[]};
  const major=source[3];
  if(major<2||major>4)return {title:'',artist:'',lyrics:'',audioOffset:0,major,frames:[]};
  const size=syncSafe(source,6);
  const footer=major===4&&(source[5]&0x10)?10:0;
  const audioOffset=10+size+footer;
  if(size>MAX_TAG_BYTES||source.length<10+size)return {title:'',artist:'',lyrics:'',audioOffset,major,frames:[]};
  const frames=parseFrames(source.slice(10,10+size),major,source[5]);
  const titleFrame=frames.find(frame=>frame.id==='TIT2'||frame.id==='TT2');
  const artistFrame=frames.find(frame=>frame.id==='TPE1'||frame.id==='TP1');
  const lyricsFrame=frames.find(frame=>frame.id==='USLT'||frame.id==='ULT');
  return {
    title:titleFrame?frameText(titleFrame.body):'',
    artist:artistFrame?frameText(artistFrame.body):'',
    lyrics:lyricsFrame?lyricsText(lyricsFrame.body):'',
    audioOffset,major,frames
  };
}

async function leadingTag(file){
  const header=new Uint8Array(await file.slice(0,10).arrayBuffer());
  if(header.length<10||ascii(header,0,3)!=='ID3')return {bytes:header,parsed:parseId3Tag(header)};
  if(header[3]<2||header[3]>4)throw Error(`Unsupported ID3 version 2.${header[3]}.`);
  const size=syncSafe(header,6);
  if(size>MAX_TAG_BYTES)throw Error('The MP3 metadata block is too large to edit safely.');
  const footer=header[3]===4&&(header[5]&0x10)?10:0;
  const bytes=new Uint8Array(await file.slice(0,10+size+footer).arrayBuffer());
  if(bytes.length<10+size+footer)throw Error('The MP3 metadata block is truncated.');
  return {bytes,parsed:parseId3Tag(bytes)};
}

export async function readMp3Metadata(file){return (await leadingTag(file)).parsed;}

function makeFrame(id,body){
  const output=new Uint8Array(10+body.length);
  output.set(encoder.encode(id),0);
  output.set(syncSafeBytes(body.length),4);
  output.set(body,10);
  return output;
}

function textFrame(id,value){
  const text=encoder.encode(String(value??''));
  const body=new Uint8Array(1+text.length);body[0]=3;body.set(text,1);
  return makeFrame(id,body);
}

function lyricsFrame(value){
  const description=encoder.encode('LiveSet 1');
  const lyrics=encoder.encode(String(value??''));
  const body=new Uint8Array(1+3+description.length+1+lyrics.length);
  body[0]=3;body.set(encoder.encode('eng'),1);body.set(description,4);body[4+description.length]=0;body.set(lyrics,5+description.length);
  return makeFrame('USLT',body);
}

function preservedFrames(parsed){
  if(parsed.major!==3&&parsed.major!==4)return [];
  return parsed.frames.filter(frame=>{
    if(TARGET_IDS.has(frame.id)||!/^[A-Z0-9]{4}$/.test(frame.id))return false;
    const formatFlags=frame.flags?.[1]||0;
    return parsed.major===3?(formatFlags&0xe0)===0:(formatFlags&0x4f)===0;
  }).map(frame=>makeFrame(frame.id,frame.body));
}

function buildTag(parsed,{title,artist,lyrics}){
  const frames=[...preservedFrames(parsed),textFrame('TIT2',title),textFrame('TPE1',artist),lyricsFrame(lyrics)];
  const contentSize=frames.reduce((sum,frame)=>sum+frame.length,0)+PADDING_BYTES;
  const output=new Uint8Array(10+contentSize);
  output.set(encoder.encode('ID3'),0);output[3]=4;output[4]=0;output[5]=0;output.set(syncSafeBytes(contentSize),6);
  let offset=10;for(const frame of frames){output.set(frame,offset);offset+=frame.length;}
  return output;
}

function latin1Field(target,offset,length,value){
  target.fill(0,offset,offset+length);
  const text=String(value??'').slice(0,length);
  for(let i=0;i<text.length;i++)target[offset+i]=text.charCodeAt(i)<=255?text.charCodeAt(i):63;
}

async function updatedId3v1(file,{title,artist}){
  if(file.size<128)return null;
  const tail=new Uint8Array(await file.slice(file.size-128).arrayBuffer());
  if(ascii(tail,0,3)!=='TAG')return null;
  latin1Field(tail,3,30,title);latin1Field(tail,33,30,artist);
  return tail;
}

export async function rewriteMp3Metadata(file,metadata){
  const {parsed}=await leadingTag(file);
  const tag=buildTag(parsed,metadata);
  const id3v1=await updatedId3v1(file,metadata);
  const audioEnd=id3v1?file.size-128:file.size;
  const parts=[tag,file.slice(Math.min(parsed.audioOffset,audioEnd),audioEnd)];
  if(id3v1)parts.push(id3v1);
  return new Blob(parts,{type:'audio/mpeg'});
}

export function isMp3File(fileOrSong){
  const name=String(fileOrSong?.name||fileOrSong?.originalFilename||'').toLowerCase();
  const type=String(fileOrSong?.type||'').toLowerCase();
  return name.endsWith('.mp3')||type==='audio/mpeg'||type==='audio/mp3';
}
