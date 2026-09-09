import {unzipSync} from './vendor/fflate.js';

self.onmessage=({data})=>{try{const entries=unzipSync(new Uint8Array(data.buffer)),transfer=[];for(const value of Object.values(entries))transfer.push(value.buffer);postMessage({type:'complete',entries},transfer);}catch(error){postMessage({type:'error',message:error?.message||String(error)});}};
