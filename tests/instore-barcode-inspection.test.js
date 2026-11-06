import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectInstoreBarcode} from '../api/_instore-barcode-inspection.js';
const args={sku:'MY-001',barcode:'B-100',client:{from:name=>({select:()=>name})},websiteManifest:{items:[{sku:'B100'},{sku:'MY-001'}]},metadataProvider:async()=>({complete:true,overlays:[]})};
test('detects normalized collisions in website-only, hidden Instore and main products',async()=>{
 const readRows=async factory=>factory()==='extended_range_items'?[{sku:'OTHER',barcode:'b-100'}]:factory()==='website_stock'?[{sku:'MAIN',barcode:'B100'}]:[];
 const result=await inspectInstoreBarcode({...args,readRows});assert.deepEqual(result.matches.map(m=>m.sku).sort(),['B100','MAIN','OTHER']);
});
test('holds incomplete metadata and invalid source rows',async()=>{
 await assert.rejects(inspectInstoreBarcode({...args,readRows:async()=>[],metadataProvider:async()=>({complete:false,overlays:[]})}),/incomplete/);
 await assert.rejects(inspectInstoreBarcode({...args,readRows:async()=>[{sku:null}]}),/invalid/);
});
test('uses the actual website variant key when paging variants',async()=>{
 const orders=[];
 const client={from:name=>({select:()=>({order(column){orders.push([name,column]);return {range:async()=>({data:[],count:0,error:null})};}})})};
 const result=await inspectInstoreBarcode({...args,client,websiteManifest:{items:[]}});
 assert.equal(result.complete,true);assert.ok(orders.some(([table,column])=>table==='website_products'&&column==='website_sku'));
});
test('recognizes existing main-site codes with spaces',async()=>{
 const readRows=async factory=>factory()==='website_stock'?[{sku:'B 100',barcode:null}]:[];
 const result=await inspectInstoreBarcode({...args,readRows,websiteManifest:{items:[]}});
 assert.deepEqual(result.matches,[{sku:'B 100',source:'main'}]);
});

