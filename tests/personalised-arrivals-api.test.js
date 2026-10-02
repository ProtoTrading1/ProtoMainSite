import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonalisedArrivalsHandler} from '../api/personalised-arrivals.js';
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};}
function db(profile,products,error){const calls=[];return {calls,from(table){const query={select(fields){calls.push({table,fields});return this;},eq(key,value){calls.push({table,key,value});return this;},gt(){return this;},gte(){return this;},order(){return this;},limit(){return Promise.resolve({data:products,error});},maybeSingle(){return Promise.resolve({data:profile,error});}};return query;}};}
test('authentication denial never queries private profile or products',async()=>{
  let called=false;const res=response();await createPersonalisedArrivalsHandler({authorize:async(req,res)=>{res.status(401).json({error:'Unauthorized'});return null;},client:()=>{called=true;}})({method:'GET'},res);assert.equal(called,false);assert.equal(res.statusCode,401);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('profile query uses authenticated own ID and response exposes no private profile fields',async()=>{
  const mock=db({product_categories:['Art, craft & beads'],sales_channels:['Retail'],supply_needs:['secret']},[]);const res=response();
  await createPersonalisedArrivalsHandler({authorize:async()=>({user:{id:'own'}}),client:()=>mock})({method:'GET',query:{customerId:'another'}},res);
  assert.equal(mock.calls.some(c=>c.table==='customers' && c.key==='id' && c.value==='own'),true);assert.equal(res.statusCode,200);assert.deepEqual(res.body.suggestions,[]);assert.equal(JSON.stringify(res.body).includes('secret'),false);
});
test('unavailable queries return explicit error, never fake empty success',async()=>{
  const res=response();await createPersonalisedArrivalsHandler({authorize:async()=>({user:{id:'own'}}),client:()=>db(null,null,{code:'42P01'})})({method:'GET'},res);assert.equal(res.statusCode,503);assert.equal(res.body.suggestions,undefined);
});
test('no stated categories means no product query; nonGET rejected before auth',async()=>{
  const mock=db({product_categories:[]},[]);const res=response();await createPersonalisedArrivalsHandler({authorize:async()=>({user:{id:'own'}}),client:()=>mock})({method:'GET'},res);assert.equal(mock.calls.some(c=>c.table==='products'),false);
  let authorised=false;const second=response();await createPersonalisedArrivalsHandler({authorize:async()=>{authorised=true;}})({method:'POST'},second);assert.equal(second.statusCode,405);assert.equal(authorised,false);
});
