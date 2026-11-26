import {applyInstoreWebsiteContent,refreshInstoreBasketText} from '../../lib/instore-website-content.mjs';
import {instorePage} from '../../lib/instore-page.mjs';
if(location.hostname!=='127.0.0.1')throw Error('Local fixture only');
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="160"><rect width="180" height="160" fill="#f7f5ef"/><circle cx="90" cy="76" r="44" stroke="#39aab4" stroke-width="15" fill="none"/></svg>');
const original={id:'SYNTHETIC-1',sku:'SYNTHETIC-1',code:'SOURCE-BARCODE',barcode:'SOURCE-BARCODE',name:'BRACELET WOODEN BEADS',title:'BRACELET WOODEN BEADS',description:'Source description',originalDescription:'BRACELET WOODEN BEADS',price:32,stockQty:18,unitsOfIssue:'EACH',image,images:[image,image],isExtendedRange:true};
original.instoreSourceIdentity='a'.repeat(64);
const basket=[{qty:2,preference:'Blue',product:original}];let generation=0;
function draw(restore=false){
 const snapshot={generation:String(++generation),overrides:restore?[]:[{sku:original.sku,websiteTitle:document.querySelector('#name').value,websiteDescription:document.querySelector('#description').value,revision:String(generation),sourceIdentity:original.instoreSourceIdentity}]};
 const products=applyInstoreWebsiteContent([original],snapshot),product=instorePage(products).products[0],display=refreshInstoreBasketText(basket,products);
 const node=document.querySelector('#product');node.replaceChildren();for(const [tag,text] of [['h2',product.name],['p',product.description],['p','R32.00 EACH ·18 available'],['code',product.barcode]]){const e=document.createElement(tag);e.textContent=text;node.append(e);}const photo=document.createElement('img');photo.src=product.image;photo.alt='Unchanged synthetic selected main';node.append(photo);
 const b=document.querySelector('#basket');b.replaceChildren();for(const [tag,text] of [['h2','Basket'],['p',display[0].product.name],['p','Blue ·2 EACH'],['strong','R64.00']]){const e=document.createElement(tag);e.textContent=text;b.append(e);}
 const evidence={generation:snapshot.generation,sku:product.sku,barcode:product.barcode,price:product.price,available:product.stockQty,unit:product.unitsOfIssue,photos:product.images.length,selectedMainUnchanged:product.image===original.image,basketQuantity:display[0].qty,basketPreference:display[0].preference,basketSourceUnchanged:basket[0].product.name===original.name,databaseWrites:0,positillWrites:0};window.instoreContentFixture=evidence;document.querySelector('#proof').textContent=JSON.stringify(evidence);
}
document.querySelector('#edit').addEventListener('submit',event=>{event.preventDefault();draw();});document.querySelector('#restore').addEventListener('click',()=>draw(true));draw();
