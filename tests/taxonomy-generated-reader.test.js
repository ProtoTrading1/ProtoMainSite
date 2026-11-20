import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {materializeTaxonomy,serializeTaxonomy} from '../lib/taxonomy-generated.mjs';
const categories=[{id:'arts-and-crafts',label:'Arts and Crafts',children:[{id:'art-supplies',label:'Art Supplies',children:[]}]}];
const tree=materializeTaxonomy({categories});
tree.find(n=>n.id==='mottaro').children.find(n=>n.id==='mottaro-art-supplies').children.push({id:'manual-sets',label:'Sets',children:[],manualGenerated:true});
const payload=serializeTaxonomy(tree,{previous:{categories}});
const handlerUrl=new URL('../api/taxonomy.js',import.meta.url);
let source=await readFile(handlerUrl,'utf8');
source=source.replace("import { readSiteConfigJson } from './_site-config.js';",'const readSiteConfigJson=(...args)=>globalThis.syntheticTaxonomyReader(...args);')
 .replace("'../lib/taxonomy-generated.mjs'",JSON.stringify(new URL('../lib/taxonomy-generated.mjs',handlerUrl).href));
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
async function read(store,hidden=[]){const reads=[];globalThis.syntheticTaxonomyReader=async file=>{reads.push(file);return file==='taxonomy/categories.json'?store:{ids:hidden};};let status,result;const original=console.error;console.error=()=>{};try{await handler({method:'GET'},{setHeader(){},status(s){status=s;return this;},json(j){result=j;return this;}});}finally{console.error=original;}return {status,result,reads};}
test('public reader returns the complete validated persisted tree and authoritative hidden state',async()=>{
 let result=await read(payload);assert.equal(result.status,200);assert.deepEqual(result.result.categories,materializeTaxonomy(payload));assert.deepEqual(result.reads,['taxonomy/categories.json']);
 result=await read({...payload,generatedTaxonomy:{...payload.generatedTaxonomy,hiddenIds:['mottaro-art-supplies']}},[]);
 assert.equal(result.result.categories.find(n=>n.id==='mottaro').children.some(n=>n.id==='mottaro-art-supplies'),false);
});
test('legacy hidden file remains compatible until the first versioned edit',async()=>{const result=await read({categories},['mottaro-art-supplies']);assert.equal(result.status,200);assert.equal(result.result.categories.find(n=>n.id==='mottaro').children.some(n=>n.id==='mottaro-art-supplies'),false);});
test('invalid persisted overlay returns unavailable instead of a tree that revives hidden nodes',async()=>{const result=await read({...payload,generatedTaxonomy:{version:99}});assert.equal(result.status,503);assert.equal(result.result.categories,undefined);});
test('products API uses the same schema and does not swallow invalid generated metadata',async()=>{
 const code=await readFile(new URL('../api/products.js',import.meta.url),'utf8');const text=code.match(/async function loadTaxonomyTree\(\) \{[\s\S]*?\r?\n\}/)[0];
 const reads=[];const loader=Function('readSiteConfigJson','loadHiddenMottaroIds','materializeTaxonomy','loadBundledTaxonomy','TAXONOMY_FILE',`return (${text});`)(async()=>payload,async()=>{reads.push('legacy');return [];},materializeTaxonomy,()=>categories,'taxonomy/categories.json');
 assert.deepEqual(await loader(),materializeTaxonomy(payload));assert.deepEqual(reads,[]);
 const broken=Function('readSiteConfigJson','loadHiddenMottaroIds','materializeTaxonomy','loadBundledTaxonomy','TAXONOMY_FILE',`return (${text});`)(async()=>({...payload,generatedTaxonomy:{version:99}}),async()=>[],materializeTaxonomy,()=>categories,'taxonomy/categories.json');
 await assert.rejects(broken(),/Invalid generated taxonomy/);
});
test('empty manual folders follow the existing public menu count filter',async()=>{
 const code=(await readFile(new URL('../src/lib/taxonomy.js',import.meta.url),'utf8')).replace("'../../lib/taxonomy-generated.mjs'",JSON.stringify(new URL('../lib/taxonomy-generated.mjs',handlerUrl).href)).replace("import bundledCategories from '../data/categories.json';",'const bundledCategories=[];');
 const nav=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const merged=materializeTaxonomy(payload),parent=merged.find(n=>n.id==='mottaro').children.find(n=>n.id==='mottaro-art-supplies');
 const selected=['mottaro','mottaro-art-supplies'];const countKey=nav.productCountKey([...selected,'manual-sets'],merged);
 assert.equal(nav.filterNavChildrenByCount(parent.children,selected,{[countKey]:0},merged).some(n=>n.id==='manual-sets'),false);
 assert.equal(nav.lookupProductCount({},[...selected,'manual-sets'],merged),0);
 assert.equal(nav.filterNavChildrenWhenCountsReady(parent.children,selected,{},merged).some(n=>n.id==='manual-sets'),false);
 assert.equal(nav.filterNavChildrenByCount(parent.children,selected,{[countKey]:1},merged).some(n=>n.id==='manual-sets'),true);
});

test('explicit manual placements browse and count without replacing automatic grouping',async()=>{
 const {manualGeneratedPlacementPaths}=await import('../lib/taxonomy-generated.mjs');
 const {isMotarroBrowsePath,isMotarroProduct,inferMotarroPathFromRow,motarroPathMatchesFilter}=await import('../lib/mottaro-category.mjs');
 const merged=materializeTaxonomy(payload),path=['mottaro','mottaro-art-supplies','manual-sets'];
 const products=[{sku:'AUTO',title:'MOTARRO',categoryPaths:[['arts-and-crafts','art-supplies']],alternateCategoryPath:['mottaro','mottaro-art-supplies']},{sku:'PLACED',title:'MOTARRO',categoryPaths:[['arts-and-crafts','art-supplies'],path],placementPaths:[path],alternateCategoryPath:['mottaro','mottaro-art-supplies']},{sku:'UNRELATED',title:'Unrelated',categoryPaths:[['arts-and-crafts','art-supplies']]}];
 const code=await readFile(new URL('../src/lib/products.js',import.meta.url),'utf8');
 const extract=name=>code.match(new RegExp('(?:async )?function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n\\}'))[0];
 const productPaths=p=>p.categoryPaths||[p.categoryPath];
 const matches=Function('manualGeneratedPlacementPaths','isMotarroBrowsePath','isMotarroProduct','inferMotarroPathFromRow','motarroPathMatchesFilter','productRowForMotarro','resolveNavPathForProducts','productPaths',`return (${extract('productMatchesNavPath')});`)(manualGeneratedPlacementPaths,isMotarroBrowsePath,isMotarroProduct,inferMotarroPathFromRow,motarroPathMatchesFilter,p=>p,()=>[],productPaths);
 assert.equal(matches(products[0],merged,path),false);assert.equal(matches(products[1],merged,path),true);assert.equal(matches(products[2],merged,path),false);
 assert.equal(matches(products[0],merged,path.slice(0,2)),true);
 const taxonomySource=(await readFile(new URL('../src/lib/taxonomy.js',import.meta.url),'utf8')).replace("'../../lib/taxonomy-generated.mjs'",JSON.stringify(new URL('../lib/taxonomy-generated.mjs',handlerUrl).href)).replace("import bundledCategories from '../data/categories.json';",'const bundledCategories=[];');
 const nav=await import('data:text/javascript;base64,'+Buffer.from(taxonomySource).toString('base64'));
 const collect=Function(`return (${extract('collectTaxonomyNavPaths')});`)();
 const dependencies={getAllCached:async()=>products,getActiveTaxonomy:()=>merged,_categoryCountsMemo:new WeakMap(),applyCollection:p=>p,applyInStockFilter:p=>p,groupProductsByBarcode:p=>p,collectTaxonomyNavPaths:collect,productCountKey:nav.productCountKey,isMotarroBrowsePath,productPaths,manualGeneratedPlacementPaths,isMotarroProduct,inferMotarroPathFromRow,productRowForMotarro:p=>p};
 const countFunction=code.match(/async function fetchCategoryCounts\([\s\S]*?\r?\n\}/)[0];
 const count=Function(...Object.keys(dependencies),`return (${countFunction});`)(...Object.values(dependencies));
 const counts=await count();assert.equal(nav.lookupProductCount(counts,path,merged),1);assert.equal(nav.lookupProductCount(counts,path.slice(0,2),merged),2);
 assert.deepEqual(products[1].alternateCategoryPath,['mottaro','mottaro-art-supplies']);
});

test('storage failure never recreates a generated branch with unknown hidden state',async()=>{
 const result=await read(null);assert.equal(result.status,200);assert.equal(result.result.categories.some(n=>n.id==='mottaro'),false);
});
