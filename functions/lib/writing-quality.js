const evidenceIds=facts=>new Set([...facts.matchAll(/Evidence ID="([a-z][a-z0-9_-]*)"/g)].map(x=>x[1]));
const candidateIds=facts=>new Set(facts.match(/\bartist_[a-p]\b/g)||[]);
const text=value=>typeof value==='string'&&value.trim().length>=10;
const numbers=s=>[...String(s).matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map(x=>x[0].replaceAll(',',''));
const grounded=(value,facts)=>{const allowed=new Set(numbers(facts));return numbers(value).every(x=>allowed.has(x));};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const mentions=(value,name)=>new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`,'iu').test(value);

// Rankings remain calculated UI. Short year commentary may describe a named
// month, but must not promote selected counts into an annual leadership claim.
export function validYearWriting(value,facts){
  if(!text(value)||value.trim().split(/\s+/).length>65)return false;
  const year=String(facts).match(/\b(?:Recorded\s+)?Year:\s*(\d{4})\b/i)?.[1];
  if(numbers(value).filter(n=>n!==year).length>2)return false;
  const leadership=/\b(?:led|lead(?:s|ing|er)?|topp(?:ed|ing)|domin(?:ant|ance|ated)|winner|favou?rite|most[- ]played|number one)\b/i;
  const month=/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
  // Split clauses too: a monthly reference must not license an annual claim
  // elsewhere in the same sentence. Ambiguous cases use the ordinary fallback.
  return value.split(/[.!?;]|\b(?:but|while|although|whereas)\b/i).every(clause=>!leadership.test(clause)||month.test(clause)&&!/\b(?:annual|whole year|entire year|overall|throughout|year[- ]long)\b/i.test(clause));
}

// One observed Gemma response wrapped the correct object in a singleton array.
// Unwrap only that envelope; never repair IDs, invent reasons, or merge answers.
export function normalizeStructuredWriting(task,value){
  if(task==='curate'&&Array.isArray(value)&&value.length===1&&value[0]&&typeof value[0]==='object'&&!Array.isArray(value[0])&&Array.isArray(value[0].picks))return value[0];
  return value;
}
function evidenceBlocks(facts){
  return new Map([...facts.matchAll(/Evidence ID="([a-z][a-z0-9_-]*)"([\s\S]*?)(?=Evidence ID="|Other recorded findings:|Year summaries:|Eras:|\nYear \d|\nEra artist:|$)/g)].map(x=>[x[1],x[2]]));
}
function candidateBlocks(facts){
  return new Map([...facts.matchAll(/^(artist_[a-p]):([^\n]*)/gm)].map(x=>[x[1],x[2]]));
}
function connectionNames(block){
  const section=block.match(/Connections:\s*([\s\S]*?)(?:\. Last\.fm audience:|\. Artist tags:|$)/i)?.[1]||'';
  const names=section.replace(/\(([^)]*)\)/g,(whole,inside)=>/\b(?:recent plays|lifetime plays|older favorite|retained discovery|recent rising artist|returning artist)\b/i.test(inside)?'':whole);
  return names.split(';').map(s=>s.trim().replace(/\.$/,'')).filter(Boolean);
}
export function validStructuredWriting(task,value,facts){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  if(task==='profile'){
    if(!text(value.notes)||!Array.isArray(value.observations)||value.observations.length>4)return false;
    const ids=evidenceIds(facts),blocks=evidenceBlocks(facts),seen=new Set();
    for(const row of value.observations){
      const id=typeof row?.id==='string'?row.id.replace(/^ID\s+/,''):'';
      if(!text(row?.text)||!id||seen.has(id)||ids.size&&!ids.has(id))return false;
      if(blocks.has(id)&&!grounded(row.text,blocks.get(id)))return false;
      seen.add(id);
    }
    if(value.years!=null&&(!Array.isArray(value.years)||value.years.some(row=>!text(row?.text)||!Number.isInteger(Number(row.year))||!facts.includes(String(row.year)))))return false;
    if(value.eras!=null&&(!Array.isArray(value.eras)||value.eras.some(row=>!text(row?.line)||typeof row.title!=='string'||row.title.length>60||typeof row.artist!=='string'||!row.artist.trim()||!facts.includes(row.artist))))return false;
    return grounded(value.notes,facts);
  }
  if(task==='curate'){
    if(!Array.isArray(value.picks)||value.picks.length<3||value.picks.length>8)return false;
    const ids=candidateIds(facts),blocks=candidateBlocks(facts),seen=new Set();
    const connections=new Map([...blocks].map(([id,block])=>[id,connectionNames(block)]));
    const allNames=new Set([...connections.values()].flat());
    for(const pick of value.picks){
      if(!text(pick?.reason)||!ids.has(pick.id)||seen.has(pick.id))return false;
      const block=blocks.get(pick.id),names=connections.get(pick.id)||[];
      if(block&&!grounded(pick.reason,block))return false;
      // Whole-pool mentions are insufficient: this candidate must connect to it.
      if(names.length&&(!names.some(name=>mentions(pick.reason,name))||[...allNames].some(name=>!names.includes(name)&&mentions(pick.reason,name))))return false;
      seen.add(pick.id);
    }
    return true;
  }
  return true;
}
