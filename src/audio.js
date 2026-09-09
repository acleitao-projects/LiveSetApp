import {STEMS,uid} from './models.js?v=2';
import {StemStreamCoordinator} from './stem-stream.js?v=2';

export class AudioEngine extends EventTarget{
  constructor(){
    super();this.audio=new Audio();this.audio.preload='auto';this.session=null;this.graphVersion=0;this.engineId=uid();this.sourceIdentity=null;this.mode='original';this.context=null;this.stemStream=null;this.performance=null;this.metrics={pause:0,stop:0,seek:0,sourceChanges:0,volumeChanges:0};
    this.audio.addEventListener('timeupdate',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('ended',()=>this.handleEnded());
  }
  handleEnded(){if(this.session)this.session.state='ended';this.dispatchEvent(new Event('ended'));}
  async ensureStemStream(){
    if(this.stemStream)return this.stemStream;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)throw Error('Web Audio is unavailable on this device.');
    this.context=new AudioContextClass();await this.context.resume();
    this.stemStream=new StemStreamCoordinator(this.context);await this.stemStream.initialize();
    this.stemStream.addEventListener('state',()=>this.dispatchEvent(new Event('state')));
    this.stemStream.addEventListener('ended',()=>this.handleEnded());
    return this.stemStream;
  }
  async playTrack(track,itemId,source,lastKnownOrder=[]){
    if(this.session?.trackId===track.id&&this.session.state!=='ended'){if(this.paused)await this.toggle();return {mode:this.mode};}
    this.audio.pause();
    const requested=typeof source==='string'?{mode:'original',originalUrl:source}:source;
    let selectedMode=requested.mode;
    if(requested.mode==='stems'){
      try{
        const stream=await this.ensureStemStream();
        await stream.prepare(requested.stems,0);stream.setMix(track.performance?.stemMute||{},track.performance?.stemSolo||{});await stream.start();
        this.performance=track.performance;this.audio.removeAttribute('src');this.audio.load();
      }catch(error){
        selectedMode='original';this.dispatchEvent(new CustomEvent('stemfallback',{detail:error?.message||String(error)}));
      }
    }
    if(selectedMode==='original'){
      this.stemStream?.pause();this.audio.src=requested.originalUrl;await this.audio.play();
    }
    this.mode=selectedMode;this.sourceIdentity=selectedMode==='stems'?`stems:${track.id}:${STEMS.map(stem=>requested.stems[stem]).join('|')}`:requested.originalUrl;
    this.metrics.sourceChanges++;this.session={sessionId:uid(),trackId:track.id,originatingSetlistItemId:itemId,lastKnownOrder:[...lastKnownOrder],state:'playing'};this.graphVersion++;this.dispatchEvent(new Event('state'));return {mode:selectedMode};
  }
  async toggle(){
    if(this.mode==='stems'){if(this.stemStream.paused)await this.stemStream.start();else{this.metrics.pause++;this.stemStream.pause();}}
    else if(this.audio.paused)await this.audio.play();else{this.metrics.pause++;this.audio.pause();}
    this.dispatchEvent(new Event('state'));
  }
  async seek(delta){
    this.metrics.seek++;
    if(this.mode==='stems'){const target=Math.max(0,Math.min(this.duration,this.currentTime+delta));await this.stemStream.seek(target);}
    else this.audio.currentTime=Math.max(0,Math.min(this.audio.duration||0,this.audio.currentTime+delta));
    this.dispatchEvent(new Event('state'));
  }
  stopForExplicitTransport(){this.metrics.stop++;if(this.mode==='stems'){this.stemStream.pause();this.stemStream.seek(0);}else{this.audio.pause();this.audio.currentTime=0;}}
  setStemMute(stem,value){if(!STEMS.includes(stem)||!this.performance)return;this.performance.stemMute[stem]=!!value;this.stemStream?.setMix(this.performance.stemMute,this.performance.stemSolo);this.dispatchEvent(new Event('state'));}
  setStemSolo(stem,value){if(!STEMS.includes(stem)||!this.performance)return;this.performance.stemSolo[stem]=!!value;this.stemStream?.setMix(this.performance.stemMute,this.performance.stemSolo);this.dispatchEvent(new Event('state'));}
  resetStemMix(){if(!this.performance)return;for(const stem of STEMS){this.performance.stemMute[stem]=false;this.performance.stemSolo[stem]=false;}this.stemStream?.setMix(this.performance.stemMute,this.performance.stemSolo);this.dispatchEvent(new Event('state'));}
  get currentTime(){return this.mode==='stems'?(this.stemStream?.currentTime||0):this.audio.currentTime;}
  get duration(){return this.mode==='stems'?(this.stemStream?.duration||0):this.audio.duration;}
  get paused(){return this.mode==='stems'?(this.stemStream?.paused??true):this.audio.paused;}
  get volume(){return this.mode==='stems'?(this.stemStream?.master?.gain.value??1):this.audio.volume;}
  snapshot(){const stream=this.stemStream?.snapshot();return {engineId:this.engineId,graphVersion:this.graphVersion,sessionId:this.session?.sessionId??null,trackId:this.session?.trackId??null,originatingSetlistItemId:this.session?.originatingSetlistItemId??null,sourceIdentity:this.sourceIdentity,currentTime:this.currentTime,duration:this.duration,paused:this.paused,volume:this.volume,mode:this.mode,workletIdentity:this.stemStream?.node?'liveset-stem-player':null,playbackGeneration:stream?.generation??null,sourceFrame:stream?.sourceFrame??null,bufferedSeconds:stream?.bufferedSeconds??0,packetOwnership:stream?{queued:stream.queuedPackets,free:stream.freePackets,preparing:stream.preparingPackets}:null,consumedFrames:stream?.consumed??null,underruns:stream?.underruns??0,metrics:{...this.metrics}};}
}
