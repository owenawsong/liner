import {normalizeStructuredWriting,validStructuredWriting,validYearWriting,validQuestionWriting} from './writing-quality.js';

const numberTokens=value=>[...String(value).matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map(match=>match[0].replaceAll(',',''));
export function inspectWriting(task,raw,facts){
  let value=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim();
  if(['profile','curate','year','ask'].includes(task)){
    let parsed;
    try{parsed=normalizeStructuredWriting(task,JSON.parse(value));}catch{return {code:'invalid_response'};}
    if(task==='year'||task==='ask'){
      if(!parsed||Array.isArray(parsed)||typeof parsed.text!=='string')return {code:'invalid_response'};
      value=parsed.text.trim();
    }else{
      if(!validStructuredWriting(task,parsed,facts))return {code:'unsupported_output'};
      value=JSON.stringify(parsed);
    }
  }
  if(value.length<20)return {code:'invalid_response'};
  const allowed=new Set(numberTokens(facts));
  if(numberTokens(value).some(number=>!allowed.has(number)))return {code:'unsupported_output'};
  if(task==='year'&&!validYearWriting(value,facts)||task==='ask'&&!validQuestionWriting(value))return {code:'unsupported_output'};
  return {text:value,code:null};
}

export function writingErrorCode(error){
  if(error?.code)return error.code;
  if(error?.budget)return error.status===429?'rate_limited':'budget_unavailable';
  if(error?.name==='AbortError'||error?.name==='TimeoutError')return 'timeout';
  if(error?.status===429)return 'rate_limited';
  if(error?.status)return 'provider_unavailable';
  if(error?.name==='TypeError')return 'network';
  return 'provider_unavailable';
}
