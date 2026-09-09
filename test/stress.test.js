import test from 'node:test';import assert from 'node:assert/strict';
import {newSetlist,trackItem,breakItem} from '../src/models.js';
import {insertAfter,removeItem,moveItem,resolveNext,totalDurationSeconds} from '../src/setlist.js';

test('100-item working set remains stable through repeated mutations',()=>{
  const set=newSetlist('Stress');for(let index=0;index<100;index++)set.items.push(index%10===9?breakItem('Break',15):trackItem(`track-${index}`));
  const ids=new Set(set.items.map(item=>item.id));assert.equal(ids.size,100);
  for(let index=0;index<50;index++){const anchor=set.items[index].id;insertAfter(set,anchor,trackItem(`request-${index}`));moveItem(set,set.items.at(-1).id,index);}
  for(const item of [...set.items].filter((_,index)=>index%7===0).slice(0,15))removeItem(set,item.id);
  assert.equal(new Set(set.items.map(item=>item.id)).size,set.items.length);assert.ok(resolveNext(set,set.items[20].id));
});

test('duration calculation handles long mixed setlists without changing order',()=>{
  const set=newSetlist('Long'),tracks=new Map();for(let index=0;index<90;index++){const id=`t-${index}`;tracks.set(id,{durationSeconds:180});set.items.push(trackItem(id));}for(let index=0;index<10;index++)set.items.splice(index*10,0,breakItem('Break',5));
  const before=set.items.map(item=>item.id);assert.equal(totalDurationSeconds(set,tracks),90*180+10*300);assert.deepEqual(set.items.map(item=>item.id),before);
});
