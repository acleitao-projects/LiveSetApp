const DB='liveset-db';
const VERSION=2;

export function storageCapabilities(){
  return {
    indexedDB:typeof indexedDB!=='undefined',
    opfs:!!navigator.storage?.getDirectory,
    fileSystemAccess:typeof window!=='undefined'&&typeof window.showOpenFilePicker==='function',
    navigatorStorage:!!navigator.storage
  };
}

export async function storageEstimate(){
  if(!navigator.storage?.estimate)return {usage:0,quota:0,available:Infinity,persisted:false};
  const {usage=0,quota=0}=await navigator.storage.estimate();
  const persisted=await navigator.storage.persisted?.().catch(()=>false)||false;
  return {usage,quota,available:Math.max(0,quota-usage),persisted};
}

export function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const store of ['songs','setlists','appSettings']){
        if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id'});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function request(storeName,mode,operation){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(storeName,mode);
    const result=operation(transaction.objectStore(storeName));
    result.onsuccess=()=>resolve(result.result);
    result.onerror=()=>reject(result.error);
    transaction.oncomplete=()=>db.close();
  });
}

const all=store=>request(store,'readonly',s=>s.getAll());
const get=(store,id)=>request(store,'readonly',s=>s.get(id));
const put=(store,value)=>request(store,'readwrite',s=>s.put(value)).then(()=>value);
const remove=(store,id)=>request(store,'readwrite',s=>s.delete(id));

export const repository={
  songs:{all:()=>all('songs'),get:id=>get('songs',id),put:v=>put('songs',v),delete:id=>remove('songs',id)},
  setlists:{all:()=>all('setlists'),get:id=>get('setlists',id),put:v=>put('setlists',v),delete:id=>remove('setlists',id)},
  appSettings:{all:()=>all('appSettings'),get:id=>get('appSettings',id),put:v=>put('appSettings',v),delete:id=>remove('appSettings',id)}
};

async function livesetDirectory(path='',create=false){
  const root=await navigator.storage.getDirectory();
  let directory=await root.getDirectoryHandle('liveset',{create:true});
  for(const part of path.split('/').filter(Boolean))directory=await directory.getDirectoryHandle(part,{create});
  return directory;
}

export async function readOpfsFile(path){
  const parts=path.split('/').filter(Boolean),name=parts.pop();
  const directory=await livesetDirectory(parts.join('/'));
  return (await directory.getFileHandle(name)).getFile();
}

export async function writeOpfsFile(path,data){
  const parts=path.split('/').filter(Boolean),name=parts.pop();
  const directory=await livesetDirectory(parts.join('/'),true);
  const handle=await directory.getFileHandle(name,{create:true});
  const writable=await handle.createWritable();
  await writable.write(data);await writable.close();
  return path;
}

export async function removeOpfsPath(path,{recursive=false}={}){
  try{
    const parts=path.split('/').filter(Boolean),name=parts.pop();
    const directory=await livesetDirectory(parts.join('/'));
    await directory.removeEntry(name,{recursive});
  }catch(error){if(error?.name!=='NotFoundError')throw error;}
}
