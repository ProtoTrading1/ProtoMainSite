import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { selectPersonalisedArrivals } from './_personalised-arrivals.js';
export function createPersonalisedArrivalsHandler({authorize=requireApprovedCustomer,now=Date.now,client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    const access=await authorize(req,res);if(!access)return;
    try{
      const supabase=client();
      const profile=await supabase.from('customers').select('product_categories,supply_needs,sales_channels').eq('id',access.user.id).maybeSingle();
      if(profile.error)return res.status(503).json({error:'Suggestions unavailable'});
      if(!profile.data || !Array.isArray(profile.data.product_categories) || !profile.data.product_categories.length)return res.status(200).json({suggestions:[],basis:'registration-interest'});
      const cutoff=new Date(now()-30*24*60*60*1000).toISOString();
      const products=await supabase.from('products').select('id,code,name,image_url,category_path,stock_on_hand,is_new,is_archived,created_at').eq('is_new',true).eq('is_archived',false).gt('stock_on_hand',0).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(500);
      if(products.error)return res.status(503).json({error:'Suggestions unavailable'});
      return res.status(200).json({suggestions:selectPersonalisedArrivals(profile.data,products.data,{now:now()}),basis:'registration-interest',coverage:{bounded:products.data?.length===500,recency:'catalogue-created-at'}});
    }catch{return res.status(503).json({error:'Suggestions unavailable'});}
  };
}
export default createPersonalisedArrivalsHandler();
