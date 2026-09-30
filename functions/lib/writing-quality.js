const evidenceIds=facts=>new Set([...facts.matchAll(/Evidence ID="([a-z][a-z0-9_-]*)"/g)].map(x=>x[1]));
const candidateIds=facts=>new Set(facts.match(/\bartist_[a-p]\b/g)||[]);
const text=value=>typeof value==='string'&&value.trim().length>=10;
export function validStructuredWriting(task,value,facts){
  if(!value||typeof value!=='object')return false;
  if(task==='profile'){
    if(!text(value.notes)||!Array.isArray(value.observations))return false;
    const ids=evidenceIds(facts);
    if(value.observations.some(row=>!text(row?.text)||typeof row.id!=='string'||ids.size&&!ids.has(row.id.replace(/^ID\s+/,''))))return false;
    if(value.years!=null&&(!Array.isArray(value.years)||value.years.some(row=>!text(row?.text)||!Number.isInteger(Number(row.year))||!facts.includes(String(row.year)))))return false;
    if(value.eras!=null&&(!Array.isArray(value.eras)||value.eras.some(row=>!text(row?.line)||typeof row.title!=='string'||row.title.length>60||typeof row.artist!=='string'||!row.artist.trim()||!facts.includes(row.artist))))return false;
    return true;
  }
  if(task==='curate'){
    if(!Array.isArray(value.picks)||value.picks.length<3)return false;
    const ids=candidateIds(facts),seen=new Set();
    for(const pick of value.picks){if(!text(pick?.reason)||!ids.has(pick.id)||seen.has(pick.id))return false;seen.add(pick.id);}
    return true;
  }
  return true;
}
