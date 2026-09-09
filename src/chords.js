import {normalizeChordSymbol} from './cifra.js';

// Compact, bundled V1 guitar vocabulary. Frets are low E through high E; x is muted.
const OPEN={
  C:['x',3,2,0,1,0],Cm:['x',3,5,5,4,3],C7:['x',3,2,3,1,0],Cmaj7:['x',3,2,0,0,0],Cadd9:['x',3,2,0,3,0],
  D:['x','x',0,2,3,2],Dm:['x','x',0,2,3,1],D7:['x','x',0,2,1,2],Dsus4:['x','x',0,2,3,3],
  E:[0,2,2,1,0,0],Em:[0,2,2,0,0,0],E7:[0,2,0,1,0,0],
  F:[1,3,3,2,1,1],Fm:[1,3,3,1,1,1],Fmaj7:['x','x',3,2,1,0],
  G:[3,2,0,0,0,3],G7:[3,2,0,0,0,1],
  A:['x',0,2,2,2,0],Am:['x',0,2,2,1,0],A7:['x',0,2,0,2,0],Am7:['x',0,2,0,1,0],
  B:['x',2,4,4,4,2],Bm:['x',2,4,4,3,2],B7:['x',2,1,2,0,2],Bm7:['x',2,4,2,3,2]
};
const ROOT_PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function resolveChord(symbol){
  const normalized=normalizeChordSymbol(symbol),base=normalized.split('/')[0];
  if(OPEN[base])return {symbol:normalized,frets:OPEN[base],baseFret:1};
  const match=base.match(/^([A-G](?:#|b)?)(m7|m|maj7|7)?$/);if(!match)return null;
  const pc=ROOT_PC[match[1]];if(pc==null)return null;
  const quality=match[2]||'';
  if(quality==='m7'){
    const rootFret=(pc-9+12)%12||12;
    return {symbol:normalized,frets:['x',rootFret,rootFret+2,rootFret,rootFret+1,rootFret],baseFret:rootFret};
  }
  const majorShape=quality==='m'?'Bm':'B',delta=(pc-11+12)%12,shape=OPEN[majorShape];
  return {symbol:normalized,frets:shape.map(value=>typeof value==='number'&&value>0?value+delta:value),baseFret:Math.max(1,2+delta)};
}

export function chordDiagramSvg(symbol){
  const chord=resolveChord(symbol);if(!chord)return '';
  const x=string=>18+string*13,lines=[];
  for(let string=0;string<6;string++)lines.push(`<line x1="${x(string)}" y1="30" x2="${x(string)}" y2="94"/>`);
  for(let fret=0;fret<6;fret++)lines.push(`<line x1="18" y1="${30+fret*13}" x2="83" y2="${30+fret*13}"/>`);
  chord.frets.forEach((fret,string)=>{if(fret==='x')lines.push(`<text x="${x(string)}" y="24">×</text>`);else if(fret===0)lines.push(`<circle class="open" cx="${x(string)}" cy="19" r="3"/>`);else lines.push(`<circle cx="${x(string)}" cy="${36+((fret-chord.baseFret)%5)*13}" r="4"/>`);});
  return `<svg viewBox="0 0 102 106" role="img" aria-label="${chord.symbol} guitar chord"><text class="name" x="51" y="12">${chord.symbol}</text><g>${lines.join('')}</g></svg>`;
}
