import {STEM_MODEL,validateModelManifest} from './stem-model-manifest.js?v=1';

async function directoryFor(path,{create=false}={}){
  const parts=path.split('/').filter(Boolean),root=await navigator.storage.getDirectory();
  let directory=await root.getDirectoryHandle('liveset',{create});
  for(const part of parts)directory=await directory.getDirectoryHandle(part,{create});
  return directory;
}
async function fileHandle(path,{create=false}={}){
  const parts=path.split('/').filter(Boolean),name=parts.pop(),directory=await directoryFor(parts.join('/'),{create});
  return directory.getFileHandle(name,{create});
}
async function digest(file){const value=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function verificationPath(model){return `models/${model.id}/model.verified.json`;}
function verificationReceipt(model){return {modelId:model.id,revision:model.revision,byteLength:model.byteLength,sha256:model.sha256,verifiedAt:new Date().toISOString()};}
async function readReceipt(model){try{return JSON.parse(await (await (await fileHandle(verificationPath(model))).getFile()).text());}catch(error){if(error?.name==='NotFoundError')return null;throw error;}}
async function writeReceipt(model){const handle=await fileHandle(verificationPath(model),{create:true}),writable=await handle.createWritable();await writable.write(JSON.stringify(verificationReceipt(model)));await writable.close();}
function receiptMatches(model,receipt){return receipt?.modelId===model.id&&receipt?.revision===model.revision&&receipt?.byteLength===model.byteLength&&receipt?.sha256===model.sha256;}

export class ModelAssetService extends EventTarget{
  constructor(model=STEM_MODEL){super();validateModelManifest(model);this.model=model;this.state='not-downloaded';this.error=null;}
  async getCapability(){
    if(!isSecureContext)return {supported:false,reason:'Stem separation requires HTTPS.'};
    if(!navigator.gpu)return {supported:false,reason:'WebGPU is unavailable on this device.'};
    if(!navigator.storage?.getDirectory)return {supported:false,reason:'OPFS is unavailable on this device.'};
    try{const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)return {supported:false,reason:'No usable WebGPU adapter was found.'};return {supported:true,adapter,limits:adapter.limits};}
    catch(error){return {supported:false,reason:`WebGPU adapter failed: ${error.message}`};}
  }
  async getModelState(){
    try{const file=await (await fileHandle(this.model.opfsPath)).getFile();if(file.size!==this.model.byteLength)return {state:'error',error:'Stored model size does not match the manifest.'};return {state:'ready',bytes:file.size};}
    catch(error){if(error?.name==='NotFoundError')return {state:'not-downloaded'};return {state:'error',error:error.message};}
  }
  async verifyModel(){
    this.state='loading';
    try{const file=await (await fileHandle(this.model.opfsPath)).getFile();if(file.size!==this.model.byteLength)throw Error('Stored model size does not match the manifest.');const receipt=await readReceipt(this.model);if(receipt&&!receiptMatches(this.model,receipt))throw Error('Stored model verification receipt does not match the manifest.');if(!receipt){
        // Earlier LiveSet builds only promoted this immutable final path after a successful
        // size and SHA-256 check. Record that completed verification without allocating a
        // second full-model ArrayBuffer on memory-constrained tablets.
        await writeReceipt(this.model);
      }this.state='ready';return {file,sha256:this.model.sha256};}
    catch(error){this.state='error';this.error=error;throw error;}
  }
  async downloadModel(onProgress=()=>{},signal){
    const capability=await this.getCapability();if(!capability.supported)throw Error(capability.reason);
    const estimate=await navigator.storage.estimate();const available=(estimate.quota||0)-(estimate.usage||0);if(available<this.model.byteLength*2.2)throw Error('Insufficient local storage for the verified model download transaction.');
    this.state='downloading';const temporary=`models/${this.model.id}/model.download`;
    try{
      const response=await fetch(this.model.downloadUrl,{signal,cache:'no-store'});if(!response.ok)throw Error(`Model download failed with HTTP ${response.status}.`);
      const handle=await fileHandle(temporary,{create:true}),writable=await handle.createWritable();const reader=response.body.getReader();let received=0;
      while(true){if(signal?.aborted)throw new DOMException('Model download cancelled.','AbortError');const {done,value}=await reader.read();if(done)break;await writable.write(value);received+=value.byteLength;onProgress({received,total:this.model.byteLength,ratio:received/this.model.byteLength});}
      await writable.close();if(received!==this.model.byteLength)throw Error('Downloaded model size does not match the manifest.');
      const tempFile=await handle.getFile(),hash=await digest(tempFile);if(hash!==this.model.sha256)throw Error('Downloaded model checksum does not match the manifest.');
      const final=await fileHandle(this.model.opfsPath,{create:true}),finalWritable=await final.createWritable();await finalWritable.write(tempFile);await finalWritable.close();await writeReceipt(this.model);await this.removePath(temporary);this.state='ready';return {bytes:received,sha256:hash};
    }catch(error){await this.removePath(temporary).catch(()=>{});this.state=error?.name==='AbortError'?'not-downloaded':'error';this.error=error;throw error;}
  }
  async openModel(){return (await this.verifyModel()).file;}
  async removePath(path){const parts=path.split('/').filter(Boolean),name=parts.pop(),directory=await directoryFor(parts.join('/'));await directory.removeEntry(name);}
}
