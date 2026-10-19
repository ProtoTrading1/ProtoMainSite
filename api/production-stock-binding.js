import {productionBindingHandler,renderResult} from '../lib/production-stock-binding.mjs';
const check=productionBindingHandler();
export default function handler(req,res){
 res.json=result=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");return res.end(renderResult(result));};
 return check(req,res);
}
