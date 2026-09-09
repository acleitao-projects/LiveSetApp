const ROOTS='A|B|C|D|E|F|G';
const ACCIDENTAL='(?:#|b)?';
const QUALITY='(?:m|maj|min|dim|aug|sus2|sus4|sus|add)?';
const EXTENSION='(?:2|4|5|6|7|9|11|13)?';
const ALTERATIONS='(?:[#b](?:5|9|11|13))*';
const BASS=`(?:\/(?:${ROOTS})${ACCIDENTAL})?`;
export const CHORD_PATTERN=new RegExp(`^(?:${ROOTS})${ACCIDENTAL}${QUALITY}${EXTENSION}${ALTERATIONS}${BASS}$`,'i');

export function normalizeChordSymbol(value){
  return String(value||'').replace(/[()]/g,'').replace(/♯/g,'#').replace(/♭/g,'b');
}

export function isChordToken(value){return CHORD_PATTERN.test(normalizeChordSymbol(value));}

export function chordTokens(line){
  return String(line).split(/\s+/).filter(Boolean).map(token=>token.replace(/^[|:]+|[|:,]+$/g,'')).filter(isChordToken).map(normalizeChordSymbol);
}

export function classifyLine(line){
  if(/^\s*\[[^\]\r\n]+\]\s*$/.test(line))return 'section';
  if(!line.trim())return 'blank';
  const nonSpace=line.trim().split(/\s+/),chords=chordTokens(line);
  return chords.length&&chords.length===nonSpace.length?'chords':'lyrics';
}

export function parseCifra(source){
  const raw=typeof source==='string'?source:'';
  const lines=raw.split(/\r\n|\n|\r/).map((text,index)=>({index,text,type:classifyLine(text),chords:chordTokens(text)}));
  const rows=[];
  for(let index=0;index<lines.length;index++){
    const line=lines[index];
    if(line.type==='chords'&&lines[index+1]?.type==='lyrics')rows.push({type:'pair',chord:line,lyric:lines[++index]});
    else rows.push({type:line.type,line});
  }
  const uniqueChords=[];
  for(const line of lines)for(const chord of line.chords)if(!uniqueChords.includes(chord))uniqueChords.push(chord);
  return {source:raw,lines,rows,uniqueChords};
}
