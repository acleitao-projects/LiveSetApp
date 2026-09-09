export const STEM_MODEL={
  id:'htdemucs-6s-webgpu-0c850a0',
  name:'HT-Demucs 6s WebGPU',
  source:'https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx',
  revision:'0c850a01007f48d94900b21b49a0d0ae1a17239f',
  license:'MIT',
  downloadUrl:'./qualification/model/htdemucs_6s.onnx',
  byteLength:284797240,
  sha256:'a3f5050696cda4b2344d465123acb21ee699dad7d0634dba1d282497a04ac86a',
  opfsPath:'models/htdemucs-6s-webgpu-0c850a0/model.onnx',
  input:{name:'mix',shape:[1,2,343980],type:'float32',sampleRate:44100,channels:2},
  output:{name:'stems',shape:[1,6,2,343980],type:'float32',order:['drums','bass','other','vocals','guitar','piano']},
  mapping:{vocals:['vocals'],guitar:['guitar'],bass:['bass'],drums:['drums'],other:['other','piano']},
  chunkFrames:343980,
  overlapFrames:85995,
  outputFormat:{container:'m4a',codec:'aac-lc',bitrate:128000,sampleRate:48000,channels:2},
  preprocessingVersion:1
};

export function validateModelManifest(model=STEM_MODEL){
  if(model.license!=='MIT')throw Error('The separation model license is not approved.');
  if(model.input.name!=='mix'||model.output.name!=='stems')throw Error('The separation model tensor names are incompatible.');
  if(model.input.shape.join(',')!=='1,2,343980'||model.output.shape.join(',')!=='1,6,2,343980')throw Error('The separation model tensor shapes are incompatible.');
  for(const stem of ['vocals','guitar','bass','drums','other'])if(!model.mapping[stem]?.length)throw Error(`Missing canonical ${stem} output mapping.`);
  if(model.mapping.drums.join(',')!=='drums')throw Error('Drums must remain an independent model output.');
  return true;
}
