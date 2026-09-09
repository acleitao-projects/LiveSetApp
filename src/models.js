export const STEMS=['vocals','guitar','bass','drums','other'];
export function uid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);else for(let index=0;index<bytes.length;index++)bytes[index]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function newTrack(input={}){const now=new Date().toISOString();return {id:input.id||uid(),schemaVersion:1,title:input.title||'Untitled track',artist:input.artist||'',genre:input.genre||'',originalFilename:input.originalFilename||'',originalAssetPath:input.originalAssetPath||'',originalMimeType:input.originalMimeType||'',originalSize:input.originalSize||0,durationSeconds:input.durationSeconds||0,stemState:'none',stems:{},cifraSource:input.cifraSource||'',performance:{cifraScrollSpeed:1,cifraAutoScrollEnabled:false,stemMute:Object.fromEntries(STEMS.map(s=>[s,false])),stemSolo:Object.fromEntries(STEMS.map(s=>[s,false]))},createdAt:input.createdAt||now,updatedAt:now};}
export function newSetlist(name='New Set List'){return {id:uid(),schemaVersion:1,name,items:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
export const trackItem=trackId=>({id:uid(),type:'track',trackId});
export const breakItem=(label='Break',durationMinutes=15)=>({id:uid(),type:'break',label,durationMinutes});
