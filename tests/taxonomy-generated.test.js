import test from 'node:test';
import assert from 'node:assert/strict';
import {materializeTaxonomy,serializeTaxonomy,deepestTaxonomyParent} from '../lib/taxonomy-generated.mjs';
import {inferMotarroPathFromRow} from '../lib/mottaro-category.mjs';
const regular=()=>[{id:'arts-and-crafts',label:'Arts and Crafts',children:[{id:'art-supplies',label:'Art Supplies',children:[{id:'paints',label:'Paints',children:[]}]}]},{id:'stationery',label:'Stationery',children:[]}];
const store=()=>({categories:regular(),updatedAt:'r0'});
function node(tree,path){let nodes=tree,found;for(const id of path){found=nodes.find(n=>n.id===id);if(!found)return null;nodes=found.children;}return found;}
function manual(tree,parent,id='manual-watercolour',label='Watercolour'){node(tree,parent).children.push({id,label,children:[],manualGenerated:true});return tree;}
const parent=['mottaro','mottaro-art-supplies','mottaro-paints'];
test('nested manual generated descendants survive a deterministic save/reload',()=>{
 const tree=manual(materializeTaxonomy(store()),parent);
 manual(tree,[...parent,'manual-watercolour'],'manual-mini','Mini');
 const saved=serializeTaxonomy(tree,{previous:store()});
 assert.equal(saved.categories.some(n=>n.id==='mottaro'),false);
 assert.deepEqual(saved.generatedTaxonomy.nodes.map(n=>n.path),[[...parent,'manual-watercolour','manual-mini'],[...parent,'manual-watercolour']].sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:1));
 const reload=materializeTaxonomy(saved);assert.equal(node(reload,[...parent,'manual-watercolour','manual-mini']).label,'Mini');
 assert.deepEqual(serializeTaxonomy(reload,{previous:saved}),saved);
});
test('ordinary nested additions still generate the same automatic mirror',()=>{
 const s=store();s.categories[0].children[0].children[0].children.push({id:'sets',label:'Sets',children:[]});
 const tree=materializeTaxonomy(s);assert.ok(node(tree,['arts-and-crafts','art-supplies','paints','sets']));assert.ok(node(tree,[...parent,'mottaro-sets']));
});
test('adding a generated manual child never changes inferred product grouping',()=>{
 const row={title:'MOTARRO PAINT',category:'Arts and Crafts',subcategory_one:'Art Supplies',subcategory_two:'Paints',subcategory_three:'Watercolour'};
 const before=materializeTaxonomy(store()),after=manual(materializeTaxonomy(store()),parent);
 assert.deepEqual(inferMotarroPathFromRow(row,after),inferMotarroPathFromRow(row,before));
 assert.deepEqual(inferMotarroPathFromRow({...row,subcategory_three:'Water'},after),inferMotarroPathFromRow({...row,subcategory_three:'Water'},before));
});
test('hidden parents hide all manual descendants without discarding persistence or resurrecting on restore',()=>{
 const tree=manual(materializeTaxonomy(store()),parent),saved=serializeTaxonomy(tree,{previous:store(),hiddenIds:['mottaro-paints']});
 assert.equal(node(materializeTaxonomy(saved),parent),null);assert.equal(saved.generatedTaxonomy.nodes.length,1);
 const next=serializeTaxonomy(materializeTaxonomy(saved),{previous:saved,hiddenIds:[]});assert.ok(node(materializeTaxonomy(next),[...parent,'manual-watercolour']));
});
test('regular-only legacy replacement preserves manual descendants',()=>{
 const saved=serializeTaxonomy(manual(materializeTaxonomy(store()),parent),{previous:store()});
 const replacement=serializeTaxonomy(regular(),{previous:saved});assert.deepEqual(replacement.generatedTaxonomy,saved.generatedTaxonomy);
});
test('whole-tree reorder cannot silently drop a manual folder',()=>{
 const saved=serializeTaxonomy(manual(materializeTaxonomy(store()),parent),{previous:store()});
 assert.throws(()=>serializeTaxonomy(materializeTaxonomy(store()),{previous:saved}),/explicitly/);
});
test('deleting an explicit manual subtree removes only that subtree',()=>{
 const saved=serializeTaxonomy(manual(materializeTaxonomy(store()),parent),{previous:store()});
 const next=serializeTaxonomy(materializeTaxonomy(store()),{previous:saved,removeManualPath:[...parent,'manual-watercolour']});
 assert.equal(next.generatedTaxonomy.nodes.length,0);assert.ok(node(materializeTaxonomy(next),parent));
});
test('removing a generated source parent refuses to strand manual descendants',()=>{
 const saved=serializeTaxonomy(manual(materializeTaxonomy(store()),parent),{previous:store()});
 const ordinary=regular();ordinary[0].children[0].children=[];
 assert.throws(()=>serializeTaxonomy(ordinary,{previous:saved}),/parent is missing/);
});
test('automatic node label overrides and forged provenance are rejected',()=>{
 const tree=materializeTaxonomy(store());node(tree,parent).label='Forged';assert.throws(()=>serializeTaxonomy(tree,{previous:store()}),/Automatic/);
 const tree2=materializeTaxonomy(store());node(tree2,parent).manualGenerated=true;assert.throws(()=>serializeTaxonomy(tree2,{previous:store()}),/Automatic/);
});
for(const invalid of [
 {version:2,hiddenIds:[],nodes:[]},
 {version:1,hiddenIds:[],nodes:[{path:['mottaro','missing','x'],label:'X',order:0}]},
 {version:1,hiddenIds:[],nodes:[{path:[...parent,'paints'],label:'Duplicate ID',order:0}]},
 {version:1,hiddenIds:[],nodes:[{path:[...parent,'x'],label:' Paint ',order:0}]},
 {version:1,hiddenIds:['mottaro'],nodes:[]},
 {version:1,hiddenIds:[],nodes:[{path:[...parent,'x'],label:'Paint',order:0},{path:[...parent,'y'],label:'paint',order:1}]},
])test('malformed, orphaned, duplicated or hidden-root metadata fails closed '+JSON.stringify(invalid),()=>assert.throws(()=>materializeTaxonomy({...store(),generatedTaxonomy:invalid})));
test('quick add targets only the exact deepest real unambiguous parent',()=>{
 const tree=materializeTaxonomy(store());assert.equal(deepestTaxonomyParent(tree,parent),'mottaro-paints');
 assert.equal(deepestTaxonomyParent(tree,['arts-and-crafts','art-supplies','paints']),'paints');
 for(const path of [[],['just-added'],['specials'],['__uncategorized__'],['mottaro','missing'],['mottaro','paints']])assert.equal(deepestTaxonomyParent(tree,path),null);
 const ambiguous=[{id:'one',label:'One',children:[{id:'x',label:'X',children:[]}]},{id:'two',label:'Two',children:[{id:'x',label:'X',children:[]}]}];assert.equal(deepestTaxonomyParent(ambiguous,['one','x']),null);
});

test('versioned replacement preserves manual sibling order without altering automatic sibling order',()=>{
 const tree=materializeTaxonomy(store());manual(tree,parent,'manual-a','A');manual(tree,parent,'manual-b','B');
 const children=node(tree,parent).children;children.reverse();
 const saved=serializeTaxonomy(tree,{previous:store()});assert.deepEqual(node(materializeTaxonomy(saved),parent).children.map(n=>n.id),['manual-b','manual-a']);
});
test('whole-tree replacement cannot silently remove automatic nodes',()=>{
 const tree=materializeTaxonomy(store());node(tree,['mottaro','mottaro-art-supplies']).children=[];
 assert.throws(()=>serializeTaxonomy(tree,{previous:store()}),/Automatic/);
});

test('whole-tree replace cannot insert manual nodes beneath a hidden generated parent',()=>{
 const old={...store(),generatedTaxonomy:{version:1,hiddenIds:['mottaro-paints'],nodes:[]}};
 assert.throws(()=>serializeTaxonomy(manual(materializeTaxonomy(store()),parent),{previous:old}),/Hidden/);
});
