import {STEMS} from './models.js?v=2';
import {STEM_PACKET_SECONDS,STEM_STARTUP_SECONDS,STEM_LOW_WATER_SECONDS,STEM_HIGH_WATER_SECONDS,packetByteLength,stemGainTargets} from './stem-pcm.js?v=2';

export class StemStreamCoordinator extends EventTarget{
  constructor(context){
    super();this.context=context;this.worker=null;this.node=null;this.gains={};this.generation=0;this.packetFrames=Math.round(context.sampleRate*STEM_PACKET_SECONDS);this.startupPackets=Math.ceil(STEM_STARTUP_SECONDS/STEM_PACKET_SECONDS);this.lowPackets=Math.ceil(STEM_LOW_WATER_SECONDS/STEM_PACKET_SECONDS);this.highPackets=Math.ceil(STEM_HIGH_WATER_SECONDS/STEM_PACKET_SECONDS);this.queued=0;this.free=[];this.preparing=0;this.poolInitialized=false;this.ready=false;this.playRequested=false;this.isPlaying=false;this.duration=0;this.sourceFrame=0;this.underruns=0;this.consumed=[0,0,0,0,0];this.eof=false;
  }
  async initialize(){
    await this.context.audioWorklet.addModule(new URL('./stem-player-worklet.js?v=2',import.meta.url));
    this.node=new AudioWorkletNode(this.context,'liveset-stem-player',{numberOfInputs:0,numberOfOutputs:5,outputChannelCount:[2,2,2,2,2]});
    const master=this.context.createGain();this.master=master;master.connect(this.context.destination);
    STEMS.forEach((stem,index)=>{const gain=this.context.createGain();this.gains[stem]=gain;this.node.connect(gain,index,0);gain.connect(master);});
    this.worker=new Worker(new URL('./stem-preparation-worker.js?v=3',import.meta.url),{type:'module'});
    this.worker.onmessage=event=>this.onWorkerMessage(event.data);
    this.node.port.onmessage=event=>this.onWorkletMessage(event.data);
  }
  async prepare(stems,startSeconds=0){
    const previous=this.generation;if(previous)this.worker.postMessage({type:'cancel',generation:previous});this.generation++;this.ready=false;this.playRequested=false;this.isPlaying=false;this.queued=0;this.preparing=0;this.eof=false;this.stems={...stems};this.sourceFrame=Math.max(0,Math.round(startSeconds*this.context.sampleRate));
    this.node.port.postMessage({type:'reset',generation:this.generation,sourceFrame:this.sourceFrame});
    this.worker.postMessage({type:'prepare',generation:this.generation,stems,sampleRate:this.context.sampleRate,startFrame:this.sourceFrame,packetFrames:this.packetFrames});
    this.dispatchEvent(new Event('state'));
    return new Promise((resolve,reject)=>{this.prepareResolve=resolve;this.prepareReject=reject;});
  }
  onWorkerMessage(message){
    if(message.generation!==this.generation){if(message.buffer)this.free.push(message.buffer);this.fillToHigh();return;}
    if(message.type==='prepared'){
      this.duration=message.durationSeconds;
      if(!this.poolInitialized){for(let i=0;i<this.highPackets;i++)this.free.push(new ArrayBuffer(packetByteLength(this.packetFrames)));this.poolInitialized=true;}
      this.fillToHigh();
    }else if(message.type==='packet'){
      this.preparing--;this.queued++;
      this.node.port.postMessage({type:'enqueue',generation:this.generation,startFrame:message.startFrame,frameCount:message.frameCount,channels:message.channels,buffer:message.buffer},[message.buffer]);
      if(!this.ready&&this.queued>=this.startupPackets){this.ready=true;this.prepareResolve?.(this);this.prepareResolve=null;if(this.playRequested)this.start();}
    }else if(message.type==='eof'){this.preparing--;this.eof=true;this.free.push(message.buffer);if(!this.ready&&this.queued>0){this.ready=true;this.prepareResolve?.(this);this.prepareResolve=null;if(this.playRequested)this.start();}}
    else if(message.type==='buffer-return'){this.preparing--;this.free.push(message.buffer);}
    else if(message.type==='error'){this.preparing=Math.max(0,this.preparing-1);if(message.buffer)this.free.push(message.buffer);this.prepareReject?.(Error(message.message));this.prepareReject=null;this.dispatchEvent(new CustomEvent('error',{detail:message.message}));}
  }
  onWorkletMessage(message){
    if(message.type==='consumed'){
      if(message.generation===this.generation){this.queued=Math.max(0,this.queued-1);this.sourceFrame=message.sourceFrame??this.sourceFrame;this.consumed=message.consumed||this.consumed;this.free.push(message.buffer);this.dispatchEvent(new Event('state'));if(this.eof&&this.queued===0&&this.preparing===0){this.isPlaying=false;this.dispatchEvent(new Event('ended'));}else if(this.queued<=this.lowPackets)this.fillToHigh();}
      else{this.free.push(message.buffer);this.fillToHigh();}
    }else if(message.type==='underrun'&&message.generation===this.generation){if(this.eof&&this.queued===0){this.isPlaying=false;this.dispatchEvent(new Event('ended'));return;}this.underruns++;this.sourceFrame=message.sourceFrame;this.ready=false;this.isPlaying=false;this.playRequested=true;this.fillToHigh();this.dispatchEvent(new Event('state'));}
  }
  fillToHigh(){
    while(!this.eof&&this.queued+this.preparing<this.highPackets&&this.free.length){const buffer=this.free.pop();this.preparing++;this.worker.postMessage({type:'fill',generation:this.generation,buffer},[buffer]);}
    if(!this.ready&&this.queued>=this.startupPackets){this.ready=true;if(this.playRequested)this.start();}
  }
  async start(){this.playRequested=true;if(!this.ready)return;await this.context.resume();this.node.port.postMessage({type:'play',generation:this.generation});this.playRequested=false;this.isPlaying=true;this.dispatchEvent(new Event('state'));}
  pause(){this.node.port.postMessage({type:'pause',generation:this.generation});this.playRequested=false;this.isPlaying=false;this.dispatchEvent(new Event('state'));}
  async seek(seconds){const wasPlaying=!this.paused;this.master.gain.setTargetAtTime(0,this.context.currentTime,0.005);await this.prepare(this.stems,seconds);this.master.gain.setValueAtTime(0,this.context.currentTime);this.master.gain.linearRampToValueAtTime(1,this.context.currentTime+0.015);if(wasPlaying)await this.start();}
  setMix(mutes,solos){const targets=stemGainTargets(mutes,solos);for(const stem of STEMS)this.gains[stem].gain.setTargetAtTime(targets[stem],this.context.currentTime,0.005);}
  get currentTime(){return this.sourceFrame/this.context.sampleRate;}
  get paused(){return !this.isPlaying;}
  snapshot(){return {generation:this.generation,sourceFrame:this.sourceFrame,bufferedSeconds:this.queued*STEM_PACKET_SECONDS,queuedPackets:this.queued,freePackets:this.free.length,preparingPackets:this.preparing,underruns:this.underruns,consumed:[...this.consumed]};}
  destroy(){this.worker?.terminate();this.node?.disconnect();for(const gain of Object.values(this.gains))gain.disconnect();this.master?.disconnect();}
}
