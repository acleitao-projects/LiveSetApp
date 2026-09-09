import {uid} from './models.js';

// Long-lived AudioEngine wrapping a single <audio> element. Never re-created across
// re-renders; setlist mutations do not touch this instance.
export class AudioEngine extends EventTarget{
  constructor(){
    super();
    this.audio=new Audio();
    this.audio.preload='auto';
    this.audio.crossOrigin='anonymous';
    this.session=null;
    this.graphVersion=0;
    this.engineId=uid();
    this.sourceIdentity=null;
    this.metrics={pause:0,seek:0,sourceChanges:0};
    this.audio.addEventListener('timeupdate',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('play',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('pause',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('loadedmetadata',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('ended',()=>{
      if(this.session)this.session.state='ended';
      this.dispatchEvent(new Event('ended'));
    });
  }

  async playSong(song,itemId,audioUrl,lastKnownOrder=[]){
    // Same song still active: just resume if paused.
    if(this.session?.songId===song.id&&this.session.state!=='ended'){
      if(this.session)this.session.originatingSetlistItemId=itemId;
      this.session.lastKnownOrder=[...lastKnownOrder];
      if(this.paused)await this.audio.play();
      this.dispatchEvent(new Event('state'));
      return;
    }
    this.audio.pause();
    this.audio.src=audioUrl;
    this.sourceIdentity=audioUrl;
    this.metrics.sourceChanges++;
    this.session={
      sessionId:uid(),
      songId:song.id,
      originatingSetlistItemId:itemId,
      lastKnownOrder:[...lastKnownOrder],
      state:'playing'
    };
    this.graphVersion++;
    try{await this.audio.play();}catch(error){this.session.state='error';throw error;}
    this.dispatchEvent(new Event('state'));
  }

  async toggle(){
    if(!this.session)return;
    if(this.audio.paused)await this.audio.play();
    else{this.metrics.pause++;this.audio.pause();}
    this.dispatchEvent(new Event('state'));
  }

  async seek(delta){
    if(!this.session)return;
    this.metrics.seek++;
    const target=Math.max(0,Math.min(this.audio.duration||0,this.audio.currentTime+delta));
    this.audio.currentTime=target;
    this.dispatchEvent(new Event('state'));
  }

  seekTo(seconds){
    if(!this.session)return;
    this.audio.currentTime=Math.max(0,Math.min(this.audio.duration||0,seconds));
    this.dispatchEvent(new Event('state'));
  }

  updateLastKnownOrder(order){
    if(this.session)this.session.lastKnownOrder=[...order];
  }

  get currentTime(){return this.audio.currentTime||0;}
  get duration(){return this.audio.duration||0;}
  get paused(){return this.audio.paused;}
  get volume(){return this.audio.volume;}

  snapshot(){
    return {
      engineId:this.engineId,
      graphVersion:this.graphVersion,
      sessionId:this.session?.sessionId??null,
      songId:this.session?.songId??null,
      originatingSetlistItemId:this.session?.originatingSetlistItemId??null,
      sourceIdentity:this.sourceIdentity,
      currentTime:this.currentTime,
      duration:this.duration,
      paused:this.paused,
      volume:this.volume,
      metrics:{...this.metrics}
    };
  }
}
