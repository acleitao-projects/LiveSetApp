import {assetUrl} from './storage.js';

function updateDrawerControls(){
  const drawer=document.querySelector('.drawer');
  const state=window.__livesetTest;
  if(!drawer||!state)return;
  const working=state.working();
  const select=drawer.querySelector('#open');
  if(select&&working){
    let option=select.querySelector(`option[value="${working.id}"]`);
    if(!option){option=document.createElement('option');option.value=working.id;select.append(option);}
    if(option.textContent!==working.name)option.textContent=working.name;
    if(select.value!==working.id)select.value=working.id;
  }
  drawer.querySelectorAll('.break').forEach(row=>{
    if(row.getAttribute('draggable')!=='true')row.setAttribute('draggable','true');
    if(!row.querySelector('.break-handle')){
      const handle=document.createElement('span');
      handle.className='break-handle'; handle.textContent='⠿'; handle.setAttribute('aria-hidden','true');
      row.prepend(handle);
    }
    if(!row.querySelector('.break-add')){
      const plus=document.createElement('button'); plus.className='break-add plus'; plus.type='button';
      plus.setAttribute('aria-label','Add song after break'); plus.textContent='＋';
      row.insertBefore(plus,row.querySelector('.remove'));
    }
  });
}
let scheduled=false;
let drawerObserver;
const appRoot=document.querySelector('#app');
function observeApp(){if(appRoot)drawerObserver.observe(appRoot,{childList:true,subtree:true})}
function scheduleDrawerFix(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;drawerObserver?.disconnect();updateDrawerControls();observeApp()},0)}
document.addEventListener('click',scheduleDrawerFix,true);
drawerObserver=new MutationObserver(scheduleDrawerFix);
observeApp();

document.addEventListener('click',async event=>{
  const play=event.target?.closest?.('#play');
  const state=window.__livesetTest;
  if(!play||!state||state.snapshot().sessionId)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const working=state.working();
  const firstSong=working.items.find(item=>item.type==='track');
  if(!firstSong)return;
  const track=state.tracks().find(candidate=>candidate.id===firstSong.trackId);
  if(!track)return;
  try{
    await state.engine.playTrack(track,firstSong.id,await assetUrl(track),working.items.map(item=>item.id));
  }catch(error){
    console.error('Unable to start the first setlist song.',error);
  }
},true);
