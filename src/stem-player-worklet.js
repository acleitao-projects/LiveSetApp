const STEM_COUNT=5,CHANNELS=2;

class LiveSetStemPlayer extends AudioWorkletProcessor{
  constructor(){
    super();this.queue=[];this.packet=null;this.packetOffset=0;this.playing=false;this.generation=0;this.sourceFrame=0;this.underrun=false;this.consumed=[0,0,0,0,0];
    this.port.onmessage=({data})=>this.command(data);
  }
  command(data){
    if(data.type==='enqueue'){
      if(data.generation!==this.generation)return this.port.postMessage({type:'consumed',generation:data.generation,buffer:data.buffer},[data.buffer]);
      data.pcm=new Float32Array(data.buffer);this.queue.push(data);this.port.postMessage({type:'depth',generation:this.generation,packets:this.queue.length+(this.packet?1:0)});
    }else if(data.type==='play'){this.playing=true;this.underrun=false;}
    else if(data.type==='pause')this.playing=false;
    else if(data.type==='reset'){
      this.playing=false;this.generation=data.generation;this.sourceFrame=data.sourceFrame;this.packetOffset=0;this.underrun=false;
      if(this.packet)this.port.postMessage({type:'consumed',generation:this.packet.generation,buffer:this.packet.buffer},[this.packet.buffer]);
      for(const packet of this.queue)this.port.postMessage({type:'consumed',generation:packet.generation,buffer:packet.buffer},[packet.buffer]);
      this.packet=null;this.queue=[];this.consumed.fill(this.sourceFrame);
    }
  }
  process(inputs,outputs){
    if(!this.playing)return true;
    const quantum=outputs[0][0].length;
    let rendered=0;
    while(rendered<quantum){
      if(!this.packet){this.packet=this.queue.shift()||null;this.packetOffset=0;}
      if(!this.packet){
        this.playing=false;
        if(!this.underrun){this.underrun=true;this.port.postMessage({type:'underrun',generation:this.generation,sourceFrame:this.sourceFrame});}
        break;
      }
      const available=this.packet.frameCount-this.packetOffset,take=Math.min(quantum-rendered,available),pcm=this.packet.pcm;
      const packetStride=this.packet.frameCount;
      for(let stem=0;stem<STEM_COUNT;stem++)for(let channel=0;channel<CHANNELS;channel++){
        const output=outputs[stem][channel],base=(stem*CHANNELS+channel)*packetStride+this.packetOffset;
        for(let frame=0;frame<take;frame++)output[rendered+frame]=pcm[base+frame];
      }
      rendered+=take;this.packetOffset+=take;this.sourceFrame+=take;for(let stem=0;stem<STEM_COUNT;stem++)this.consumed[stem]+=take;
      if(this.packetOffset===this.packet.frameCount){
        const done=this.packet;this.packet=null;this.packetOffset=0;
        this.port.postMessage({type:'consumed',generation:done.generation,buffer:done.buffer,sourceFrame:this.sourceFrame,consumed:[...this.consumed]},[done.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('liveset-stem-player',LiveSetStemPlayer);
