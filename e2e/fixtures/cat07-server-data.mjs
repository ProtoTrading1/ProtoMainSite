import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import reviewed from '../../lib/cat07-reviewed-views.json' with {type:'json'};
import {cat07ManifestHash} from '../../lib/cat07-order-preview.mjs';
export const fixtureReceipt={status:'complete',protocol:'proto.cat07-family-publication.v1',receiptId:'00000000-0000-4000-8000-000000000274',sku:reviewed.sku,barcode:reviewed.sku,destination:'instore',mainViewId:'overview',views:[],manifestHash:''};
export const fixtureImages=new Map();
const specs=[{id:'overview',role:'overview',label:'Saved family reference overview',...reviewed.overview},...reviewed.styles.map(style=>({id:'style-'+style.attachment,role:'style',...style}))];
for(const spec of specs){
 const original=spec.id==='overview'?Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#f3f0e9"/><g font-family="sans-serif" text-anchor="middle" fill="#343128"><text x="320" y="270" font-size="30">Original overview</text><text x="320" y="325" font-size="25">Private Archive reference</text><text x="320" y="380" font-size="20">Open the Owner link to view it</text></g></svg>'):await readFile(new URL('../../public/product-images/reviewed/8640000274/'+spec.sha256+'.jpg',import.meta.url));
 const bytes=await sharp(original).png().toBuffer(),sha256=createHash('sha256').update(bytes).digest('hex');fixtureImages.set(spec.id,bytes);
 fixtureReceipt.views.push({id:spec.id,role:spec.role,label:spec.label,original:{sha256:spec.sha256,size:spec.size,mime:'image/jpeg'},image:{url:`https://admin.proto.co.za/api/cat07-family-image/${fixtureReceipt.receiptId}/${spec.id}/${sha256}.png`,sha256,size:bytes.length,mime:'image/png'}});
}
fixtureReceipt.manifestHash=cat07ManifestHash(fixtureReceipt);
// Fictional completed receipt only. No real main/destination is selected or saved.
export const fixtureProduct={id:reviewed.sku,sku:reviewed.sku,barcode:reviewed.sku,name:'CHRISTMAS HANGING ORNAMENT',title:'CHRISTMAS HANGING ORNAMENT',price:6,stockQty:6,stockOnHand:6,unitsOfIssue:'EACH',isExtendedRange:true,minQty:1,image:fixtureReceipt.views[0].image.url,images:fixtureReceipt.views.map(v=>v.image.url),cat07Family:fixtureReceipt,inStock:true,availability:{state:'in_stock',label:'In stock',canOrder:true}};
