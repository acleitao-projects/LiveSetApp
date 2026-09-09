import {uid} from './models.js?v=2';
import {repository,commitStemGeneration,cleanupSplitJob,deleteTrackAssets} from './storage.js?v=3';
import {ModelAssetService} from './model-asset-service.js?v=1';
import {TrackService} from './track-service.js?v=5';

export const JOB_STATES=['queued','preparing','loading-model','running','encoding-writing','validating','committing','complete','failed','cancelling','cancelled'];

export class StemSeparationService extends EventTarget{
  constructor(dependencies={}){super();this.modelAssets=dependencies.modelAssets||new ModelAssetService();this.trackService=dependencies.trackService||new TrackService();this.repository=dependencies.repository||repository;this.commitGeneration=dependencies.commitStemGeneration||commitStemGeneration;this.cleanupJob=dependencies.cleanupSplitJob||cleanupSplitJob;this.deleteAssets=dependencies.deleteTrackAssets||deleteTrackAssets;this.workerFactory=dependencies.workerFactory||(()=>new Worker(new URL('./stem-separation-worker.js?v=9',import.meta.url),{type:'module'}));this.jobs=new Map();this.activeJobId=null;}
  snapshot(jobId=this.activeJobId){const job=this.jobs.get(jobId);return job?structuredClone({...job,worker:undefined,draft:undefined}):null;}
  emit(job){this.dispatchEvent(new CustomEvent('state',{detail:this.snapshot(job.id)}));for(const listener of job.listeners)listener(this.snapshot(job.id));}
  subscribe(jobId,listener){const job=this.jobs.get(jobId);if(!job)throw Error('Separation job not found.');job.listeners.add(listener);listener(this.snapshot(jobId));return()=>job.listeners.delete(listener);}
  async start({trackId=null,file=null,sourceAssetPath=null,draft=null,modelId=null}){
    if(this.activeJobId&&this.jobs.get(this.activeJobId)?.state&&!['complete','failed','cancelled'].includes(this.jobs.get(this.activeJobId).state))throw Error('Another stem separation is already running.');
    if(!trackId&&!file)throw Error('Choose an existing Track or external audio file before splitting.');
    const capability=await this.modelAssets.getCapability();if(!capability.supported)throw Error(capability.reason);const modelState=await this.modelAssets.getModelState();if(modelState.state!=='ready')throw Error('Download and verify the separation model first.');await this.modelAssets.verifyModel();
    const id=uid(),worker=this.workerFactory(),job={id,state:'queued',progress:0,detail:'Queued',error:null,trackId,draft,file,sourceAssetPath,worker,listeners:new Set(),startedAt:new Date().toISOString()};this.jobs.set(id,job);this.activeJobId=id;this.emit(job);
    worker.onmessage=event=>this.handleMessage(job,event.data);worker.onerror=event=>this.fail(job,Error(event.message||'Separation worker failed.'));
    worker.postMessage({type:'start',jobId:id,trackId,file,sourceAssetPath,modelId});return {jobId:id};
  }
  async handleMessage(job,message){if(message.jobId!==job.id)return;if(message.type==='status'){job.state=message.state;job.progress=message.progress;job.detail=message.detail;this.emit(job);return;}if(message.type==='error'){if(message.name==='AbortError'||job.state==='cancelling'){job.state='cancelled';job.detail='Cancelled';await this.cleanupJob(job.id).catch(()=>{});job.worker.terminate();this.emit(job);return;}return this.fail(job,Object.assign(Error(message.message),{stack:message.stack}));}if(message.type==='complete')await this.commit(job,message);}
  async commit(job,result){
    job.state='committing';job.progress=.97;job.detail='Committing validated stems';this.emit(job);let createdTrack=null;
    try{
      let trackId=job.trackId;
      if(!trackId){createdTrack=await this.trackService.saveTrackDraft(job.draft);trackId=createdTrack.id;}
      const track=await this.commitGeneration(trackId,job.id,{repositoryOverride:this.repository});job.trackId=trackId;job.result={track,...result};job.state='complete';job.progress=1;job.detail='Five stems ready';job.completedAt=new Date().toISOString();job.worker.terminate();this.emit(job);
    }catch(error){if(createdTrack){await this.repository.tracks.delete(createdTrack.id).catch(()=>{});await this.deleteAssets(createdTrack.id).catch(()=>{});}await this.fail(job,error);}
  }
  async fail(job,error){job.error={name:error.name||'Error',message:error.message||String(error)};job.state='failed';job.detail=job.error.message;job.completedAt=new Date().toISOString();await this.cleanupJob(job.id).catch(()=>{});job.worker.terminate();this.emit(job);}
  cancel(jobId=this.activeJobId){const job=this.jobs.get(jobId);if(!job||['complete','failed','cancelled'].includes(job.state))return false;job.state='cancelling';job.detail='Cancelling…';job.worker.postMessage({type:'cancel',jobId});this.emit(job);return true;}
  async cleanupAbandonedJobs(){
    try{let directory=await navigator.storage.getDirectory();directory=await directory.getDirectoryHandle('liveset');directory=await directory.getDirectoryHandle('temp');const splits=await directory.getDirectoryHandle('splits');for await(const [name] of splits.entries())await splits.removeEntry(name,{recursive:true});}
    catch(error){if(error?.name!=='NotFoundError')throw error;}
  }
}
