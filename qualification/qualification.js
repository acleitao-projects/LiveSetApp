import * as ort from './vendor/ort.webgpu.min.mjs';

const MODEL={
  id:'kramp-htdemucs-6s-webgpu-onnx-0c850a0',
  url:'./model/htdemucs_6s.onnx',
  bytes:284797240,
  sha256:'a3f5050696cda4b2344d465123acb21ee699dad7d0634dba1d282497a04ac86a',
  input:{name:'mix',shape:[1,2,343980]},
  output:{name:'stems',shape:[1,6,2,343980]}
};
const runButton=document.querySelector('#run'),copyButton=document.querySelector('#copy');
const status=document.querySelector('#status'),progress=document.querySelector('#progress'),result=document.querySelector('#result');
let report={};

function show(message,value){status.textContent=message;progress.value=value;report.lastStatus=message;result.textContent=JSON.stringify(report,null,2);}
function errorDetails(error){return {name:error?.name||'',message:error?.message||String(error),stack:error?.stack||''};}
async function sha256(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
async function run(){
  runButton.disabled=true;copyButton.disabled=true;
  report={startedAt:new Date().toISOString(),model:MODEL,environment:{userAgent:navigator.userAgent,platform:navigator.platform,standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,secureContext:isSecureContext,online:navigator.onLine,navigatorGpu:Boolean(navigator.gpu),deviceMemory:navigator.deviceMemory??null,storageEstimate:null},timings:{},memory:{before:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null},passed:false};
  try{
    report.environment.storageEstimate=await navigator.storage?.estimate?.()||null;
    if(!isSecureContext)throw Error('A secure HTTPS context is required.');
    if(!navigator.gpu)throw Error('navigator.gpu is unavailable.');
    show('Requesting WebGPU adapter…',2);
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw Error('requestAdapter() returned null.');
    report.adapter={info:adapter.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description}:null,limits:Object.fromEntries(Object.entries(adapter.limits).map(([key,value])=>[key,typeof value==='bigint'?String(value):value]))};
    show('Downloading 285 MB model…',5);
    const downloadStart=performance.now();
    const response=await fetch(MODEL.url,{cache:'no-store'});if(!response.ok)throw Error(`Model download failed: HTTP ${response.status}`);
    const modelBuffer=await response.arrayBuffer(),modelBytes=new Uint8Array(modelBuffer);
    report.timings.downloadMs=Math.round(performance.now()-downloadStart);report.downloadedBytes=modelBytes.byteLength;
    show('Verifying SHA-256…',38);const hashStart=performance.now();report.actualSha256=await sha256(modelBytes);report.timings.hashMs=Math.round(performance.now()-hashStart);if(report.actualSha256!==MODEL.sha256)throw Error(`Model checksum mismatch: ${report.actualSha256}`);
    show('Creating WebGPU-only ONNX session…',45);const loadStart=performance.now();
    const session=await ort.InferenceSession.create(modelBytes,{executionProviders:['webgpu']});
    report.timings.sessionCreateMs=Math.round(performance.now()-loadStart);report.session={inputNames:session.inputNames,outputNames:session.outputNames};
    show('Running one real inference…',58);const inputData=new Float32Array(2*343980);for(let i=0;i<343980;i++){const sample=Math.sin(2*Math.PI*440*i/44100)*0.01;inputData[i]=sample;inputData[343980+i]=sample;}
    const inferenceStart=performance.now();const outputs=await session.run({mix:new ort.Tensor('float32',inputData,MODEL.input.shape)});const stemTensor=outputs.stems;const data=await stemTensor.getData();report.timings.inferenceMs=Math.round(performance.now()-inferenceStart);
    let finite=true,nonZero=false,peak=0;for(let i=0;i<data.length;i+=Math.max(1,Math.floor(data.length/20000))){const value=data[i];finite&&=Number.isFinite(value);nonZero||=Math.abs(value)>1e-8;peak=Math.max(peak,Math.abs(value));}
    report.output={dims:stemTensor.dims,type:stemTensor.type,length:data.length,sampledFinite:finite,sampledNonZero:nonZero,sampledPeak:peak};
    if(!finite||!nonZero)throw Error('Inference output validation failed: expected finite, non-zero stem samples.');
    stemTensor.dispose?.();await session.release();report.memory.after=performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null;report.passed=true;report.completedAt=new Date().toISOString();show('PASS — WebGPU session and real inference completed.',100);
  }catch(error){report.error=errorDetails(error);report.completedAt=new Date().toISOString();show(`FAIL — ${report.error.message}`,100);}
  finally{runButton.disabled=false;copyButton.disabled=false;}
}
runButton.addEventListener('click',run);copyButton.addEventListener('click',async()=>{await navigator.clipboard.writeText(JSON.stringify(report,null,2));status.textContent='Results copied.';});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(error=>{report.serviceWorkerError=errorDetails(error);});
show('Ready. Tap Run Qualification.',0);
