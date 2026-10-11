import { analyze } from './analysis.js';

self.onmessage = ({data}) => {
  try {
    const result=analyze(data.rows,{minMs:data.minMs});
    // The caller already has the raw history; avoid cloning it back a second time.
    result.rows=null;
    self.postMessage({result});
  } catch(error) { self.postMessage({error:error.message||'The listening history could not be analysed.'}); }
};
