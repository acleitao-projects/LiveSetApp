export const SCHEMA_VERSION=2;

export function uid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);
  else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function newSong(input={}){
  const now=new Date().toISOString();
  return {
    id:input.id||uid(),
    schemaVersion:SCHEMA_VERSION,
    title:input.title||'Untitled song',
    artist:input.artist||'',
    notes:input.notes||'',
    originalFilename:input.originalFilename||'',
    originalSize:input.originalSize||0,
    durationSeconds:input.durationSeconds||0,
    source:input.source||null,
    cifraSource:input.cifraSource||'',
    transposeSemitones:input.transposeSemitones||0,
    cifraScrollSpeed:input.cifraScrollSpeed??1,
    cifraAutoScrollEnabled:!!input.cifraAutoScrollEnabled,
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}

export function newSetlist(name='New Set List'){
  const now=new Date().toISOString();
  return {id:uid(),schemaVersion:SCHEMA_VERSION,name,items:[],createdAt:now,updatedAt:now};
}

export const trackItem=songId=>({id:uid(),type:'track',songId});
export const breakItem=(label='Break',durationMinutes=15)=>({id:uid(),type:'break',label,durationMinutes});
