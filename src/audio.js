import {uid} from './models.js?v=36';

// Long-lived AudioEngine wrapping a single <audio> element. Never re-created across
// re-renders; setlist mutations do not touch this instance.
//
// Two playback modes:
//   - Direct: <audio> element → default output. Zero-cost, always available.
//   - Pitch : <audio> element → MediaElementAudioSourceNode → PitchShifter
//             AudioWorklet → AudioContext.destination. Enabled when the user
//             toggles "Match playback pitch to transpose". Audio path is stable
//             once wired (MediaElementSource can only be created once per audio
//             element), so we keep it warm and just swap the internal graph.
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

    // Pitch pipeline (built lazily on first request)
    this.context=null;
    this.mediaSource=null;
    this.pitchNode=null;
    this.directGain=null;
    this.pitchGain=null;
    this.pitchModeReady=false;
    this.pitchModeActive=false;   // true when audio is currently routed via worklet
    this.currentPitchRatio=1.0;

    this.audio.addEventListener('timeupdate',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('play',()=>{this.resumeContext();this.dispatchEvent(new Event('state'));});
    this.audio.addEventListener('pause',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('loadedmetadata',()=>this.dispatchEvent(new Event('state')));
    this.audio.addEventListener('ended',()=>{
      if(this.session)this.session.state='ended';
      this.dispatchEvent(new Event('ended'));
    });
  }

  async playSong(song,itemId,audioUrl,lastKnownOrder=[]){
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

  // ---------- Pitch pipeline ----------

  resumeContext(){
    if(this.context?.state==='suspended')this.context.resume().catch(()=>{});
  }

  async ensurePitchPipeline(){
    if(this.pitchModeReady)return true;
    if(typeof AudioContext==='undefined'&&typeof webkitAudioContext==='undefined')return false;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      this.context=new Ctx();
      await this.context.audioWorklet.addModule('./src/pitch-worklet.js?v=36');
      // Create the MediaElementSource once; it "captures" the audio element.
      this.mediaSource=this.context.createMediaElementSource(this.audio);
      this.pitchNode=new AudioWorkletNode(this.context,'pitch-shifter',{
        numberOfInputs:1,
        numberOfOutputs:1,
        outputChannelCount:[2],
        processorOptions:{pitchRatio:this.currentPitchRatio}
      });
      this.directGain=this.context.createGain();
      this.pitchGain=this.context.createGain();
      this.directGain.gain.value=1;
      this.pitchGain.gain.value=0;
      // Always route both paths; use gains to select.
      this.mediaSource.connect(this.directGain).connect(this.context.destination);
      this.mediaSource.connect(this.pitchNode).connect(this.pitchGain).connect(this.context.destination);
      this.pitchModeReady=true;
      return true;
    }catch(error){
      this.pitchModeReady=false;
      return false;
    }
  }

  // Enable or disable pitch-preserved playback.
  //   ratio > 0 = enable and set the pitch ratio (2^(semitones/12))
  //   ratio = 1 with `enabled=false` = disable, route to direct output
  async setPitchRatio(ratio,{enabled=true}={}){
    const target=Math.max(0.5,Math.min(2.0,Number(ratio)||1));
    this.currentPitchRatio=target;
    if(!enabled||target===1){
      // Direct mode
      if(this.pitchModeReady){
        this.directGain.gain.value=1;
        this.pitchGain.gain.value=0;
      }
      this.pitchModeActive=false;
      return;
    }
    // Enable pitch mode; lazy-build pipeline if needed
    if(!this.pitchModeReady)await this.ensurePitchPipeline();
    if(!this.pitchModeReady)return; // unsupported → silently no-op
    this.pitchNode.port.postMessage({pitchRatio:target});
    this.directGain.gain.value=0;
    this.pitchGain.gain.value=1;
    this.pitchModeActive=true;
    this.resumeContext();
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
      pitchActive:this.pitchModeActive,
      pitchRatio:this.currentPitchRatio,
      metrics:{...this.metrics}
    };
  }
}
