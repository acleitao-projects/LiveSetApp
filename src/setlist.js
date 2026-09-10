import {trackItem,breakItem,newSetlist} from './models.js';

export const clone=v=>structuredClone(v);
export const itemIndex=(set,id)=>set.items.findIndex(i=>i.id===id);

export function insertAfter(set,afterId,item){
  const i=itemIndex(set,afterId);
  set.items.splice(i<0?set.items.length:i+1,0,item);
  return set;
}
export function appendTrack(set,songId){set.items.push(trackItem(songId));return set;}
export function addBreak(set){set.items.push(breakItem());return set;}
export function removeItem(set,id){const i=itemIndex(set,id);if(i>=0)set.items.splice(i,1);return set;}
export function moveItem(set,id,to){
  const from=itemIndex(set,id);if(from<0)return set;
  const [x]=set.items.splice(from,1);
  set.items.splice(Math.max(0,Math.min(to,set.items.length)),0,x);
  return set;
}
export function isDirty(working,saved){
  if(!saved)return true;
  const workingAuto=working.autoAdvance!==false;
  const savedAuto=saved.autoAdvance!==false;
  return JSON.stringify(working.items)!==JSON.stringify(saved.items)||working.name!==saved.name||workingAuto!==savedAuto;
}
export function totalDurationSeconds(set,songsById){
  return set.items.reduce((total,item)=>{
    if(item.type==='break')return total+Number(item.durationMinutes||0)*60;
    return total+Number(songsById.get(item.songId)?.durationSeconds||0);
  },0);
}
export function formatDuration(totalSeconds){
  const total=Math.max(0,Math.round(totalSeconds||0));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
export function resolveNext(set,activeItemId,lastKnownOrder=[]){
  const i=itemIndex(set,activeItemId);
  if(i>=0)return set.items.slice(i+1).find(x=>x.type==='track'||x.type==='break');
  const old=lastKnownOrder.indexOf(activeItemId);
  return old<0?set.items.find(x=>x.type==='track'):lastKnownOrder.slice(old+1).map(id=>set.items.find(x=>x.id===id)).find(Boolean)||set.items.find(x=>x.type==='track');
}
export function resolvePrevious(set,activeItemId,lastKnownOrder=[]){
  const i=itemIndex(set,activeItemId);
  if(i>=0)return i<=0?undefined:[...set.items.slice(0,i)].reverse().find(x=>x.type==='track');
  const old=lastKnownOrder.indexOf(activeItemId);
  return old<=0?undefined:lastKnownOrder.slice(0,old).reverse().map(id=>set.items.find(x=>x.id===id)).find(x=>x?.type==='track');
}
export {newSetlist};
