import {CHORD_PATTERN,normalizeChordSymbol} from './cifra.js';

const SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const ROOT_PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};

function normalizeSemitones(n){const v=Math.round(Number(n)||0)%12;return (v+12)%12;}

function shiftRoot(root,semitones,prefer){
  const pc=ROOT_PC[root];
  if(pc==null)return root;
  const target=(pc+normalizeSemitones(semitones))%12;
  return (prefer==='flat'?FLAT:SHARP)[target];
}

// Peel off surrounding punctuation like (, ), |, :, ,
function splitPunctuation(token){
  const match=String(token).match(/^([\(\|:]*)(.*?)([\)\|:,.]*)$/);
  return match?{leading:match[1]||'',core:match[2]||'',trailing:match[3]||''}:{leading:'',core:String(token||''),trailing:''};
}

// Preserve the ORIGINAL token verbatim except for the root letter(s). This keeps parens,
// odd capitalization, and Brazilian shorthand ("7M") intact. The chord is validated against
// the normalized-symbol grammar before we rewrite.
export function transposeChordToken(token,semitones,{prefer='sharp'}={}){
  if(!Number.isFinite(semitones)||semitones===0)return token;
  const {leading,core,trailing}=splitPunctuation(token);
  if(!CHORD_PATTERN.test(normalizeChordSymbol(core)))return token;

  const rootMatch=core.match(/^([A-G])([#b♯♭])?/);
  if(!rootMatch)return token;
  const rootLetter=rootMatch[1];
  const rootAccRaw=rootMatch[2]||'';
  const rootAcc=rootAccRaw.replace(/♯/g,'#').replace(/♭/g,'b');
  const newRoot=shiftRoot(`${rootLetter}${rootAcc}`,semitones,prefer);
  let rest=core.slice(rootMatch[0].length);

  // Slash bass may appear anywhere in the tail (e.g. "Am7/G", "F#m7(9)/C#")
  const bassMatch=rest.match(/\/([A-G])([#b♯♭])?/);
  if(bassMatch){
    const bassAcc=(bassMatch[2]||'').replace(/♯/g,'#').replace(/♭/g,'b');
    const newBass=shiftRoot(`${bassMatch[1]}${bassAcc}`,semitones,prefer);
    rest=rest.slice(0,bassMatch.index)+'/'+newBass+rest.slice(bassMatch.index+bassMatch[0].length);
  }

  return `${leading}${newRoot}${rest}${trailing}`;
}

// Line-preserving transposition: whitespace segments preserved verbatim between tokens.
export function transposeChordLine(line,semitones,{prefer='sharp'}={}){
  if(!Number.isFinite(semitones)||semitones===0)return line;
  const parts=String(line).split(/(\s+)/);
  return parts.map(part=>/\s+/.test(part)?part:transposeChordToken(part,semitones,{prefer})).join('');
}

export function transposeChordSymbol(symbol,semitones,options){
  return transposeChordToken(symbol,semitones,options);
}
