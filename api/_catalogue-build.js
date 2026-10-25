// Global catalogue data is shared only AFTER each request's customer approval.
// Coalesce identical cold builds without extending the existing freshness TTL.
export function createCatalogueBuildCache({now=Date.now,ttlMs=60000,maxPending=4}={}) {
 let memo=null,latest=null;const pending=new Map();
 const peek=key=>memo?.key===key&&now()-memo.at<ttlMs?memo.value:null;
 const get=(key,build)=>{
  const cached=peek(key);if(cached)return Promise.resolve(cached);
  if(pending.has(key))return pending.get(key);
  if(pending.size>=maxPending)return Promise.reject(Object.assign(Error('Catalogue refresh is busy. Please try again shortly.'),{code:'CATALOGUE_BUSY'}));
  latest=key;
  const promise=Promise.resolve().then(build).then(value=>{
   if(!Array.isArray(value))throw Error('Catalogue response is invalid.');
   if(latest===key)memo={key,value,at:now()};return value;
  }).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
  pending.set(key,promise);return promise;
 };
 return Object.freeze({peek,get});
}
