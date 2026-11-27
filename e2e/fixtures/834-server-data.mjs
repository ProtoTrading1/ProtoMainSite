import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import views from '../../lib/834-reviewed-views.json' with {type:'json'};
import {ballsManifestHash} from '../../lib/834-order.mjs';
// Explicitly fictional receipt, confined to the isolated fixture. The images
// are the six existing public photos; no private originals are read or copied.
export const fixtureReceipt={status:'complete',protocol:'proto.834-public-family.v1',receiptId:'00000000-0000-4000-8000-000000000834',sku:'8-34',barcode:'8-34',destination:'website',mainViewId:'gold',views:structuredClone(views),manifestHash:''};fixtureReceipt.manifestHash=ballsManifestHash(fixtureReceipt);
export const fixtureRow={sku:'8-34',barcode:'8-34',image_url_one:views[0].image.url,units_of_issue:'10PC',to_order:false};
export const fixtureProduct={id:'8-34',sku:'8-34',barcode:'8-34',code:'8-34',name:'CHRISTMAS BAUBLES | 6CM | 10PC TUBE',price:36,stockQty:14,stockOnHand:14,unitsOfIssue:'10PC',isExtendedRange:false,minQty:1,image:views[0].image.url,images:views.map(v=>v.image.url),ballsFamily:fixtureReceipt,inStock:true,availability:{state:'in_stock',label:'In stock',canOrder:true}};
export const fixtureSource=()=>({authority:'live-exact-code-observation',canonicalCode:'8-34',units:'10PC',priceInclVat:36,onHand:14,booked:0,available:14,observedAt:new Date().toISOString()});
export async function loadPublicFixtureImages(){const map=new Map();for(const view of views){const bytes=await readFile(new URL('./834-public/'+view.image.sha256+'.jpg',import.meta.url));if(bytes.length!==view.image.size||createHash('sha256').update(bytes).digest('hex')!==view.image.sha256)throw Error('Public photo copy changed');map.set(view.id,bytes);}return map;}
