// NEVER MERGE. Reads only synthetic metadata on the protected Test storefront.
const BASE='https://pyrwimlmmruxtuxhdsom.supabase.co';
const PROJECT='prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu';
const BRANCH='codex/isolated-storefront-workflow-20261106';
const HOST='protoportal-main-git-codex-isolated-storefron-e45b85-proto-team.vercel.app';
const owners=new Set(['danieljoffeinfo@gmail.com','george@proto.co.za','online@proto.co.za']);
export function createReusableTestGallery({env,authenticate,transport=globalThis.fetch}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(env?.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!==PROJECT||env.VERCEL_GIT_COMMIT_REF!==BRANCH
    ||req.method!=='GET'||req.headers.host!==HOST||typeof authenticate!=='function'||typeof transport!=='function')throw Error();
   const url=new URL(req.url,`https://${HOST}`),runId=url.searchParams.get('runId');
   if(url.pathname!=='/api/reusable-gallery-proof'||url.searchParams.size!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(runId||''))throw Error();
   const user=await authenticate(req,res);if(!user)return;
   if(!owners.has(String(user.email||'').trim().toLowerCase()))throw Error();
   const token=String(env.PROTO_ISOLATED_TEST_READ_TOKEN||''),key=String(env.PROTO_ISOLATED_TEST_ANON_KEY||'');
   if(!/^[a-f0-9]{64}$/.test(token)||!key)throw Error();
   const response=await transport(BASE+'/functions/v1/reusable-synthetic-gallery-test-20261111',{
    method:'POST',headers:{apikey:key,...(key.startsWith('sb_publishable_')?{}:{authorization:`Bearer ${key}`}), 'content-type':'application/json'},
    body:JSON.stringify({token,runId}),redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});
   if(!response.ok||!response.body)throw Error();
   const reader=response.body.getReader(),parts=[];let length=0;
   try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>32768)throw Error();parts.push(part.value);}}
   finally{void reader.cancel().catch(()=>{});}
   const result=JSON.parse(Buffer.concat(parts,length).toString('utf8'));
   if(result?.status==='not_published')return res.status(200).json({status:'not_published'});
   if(result?.status!=='synthetic_gallery'||result.sku!=='SYNTH-FULLUI-17'||!Array.isArray(result.photos)||result.photos.length!==17
    ||result.mainPhotoId!==result.photos[0]?.photoId||result.photos.some(p=>!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.photoId||'')
    ||!/^[a-f0-9]{64}$/.test(p.sha256||'')||typeof p.url!=='string'||!p.url.startsWith(`${BASE}/storage/v1/object/sign/recovery-full-ui-20261110/reusable-review-v1/${runId}/${p.photoId}/${p.sha256}.png?token=`)))throw Error();
   return res.status(200).json({status:'synthetic_gallery',sku:result.sku,mainPhotoId:result.mainPhotoId,photos:result.photos});
  }catch{return res.status(403).json({status:'held'});}
 };
}
