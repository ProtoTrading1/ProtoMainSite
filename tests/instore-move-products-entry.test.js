import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=new URL('./fixtures/instore-move-handler.mjs',import.meta.url);
for(const enabled of ['off','on'])for(const path of ['full','skus','browse','identifier'])test(`actual products handler keeps ${path} compatible with move galleries ${enabled}`,()=>{
 const result=execFileSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(fixture),enabled,path],{encoding:'utf8'});
 assert.equal(JSON.parse(result.trim()).unchanged,true);
});
for(const enabled of ['off','on'])test(`actual products handler authorizes before data with galleries ${enabled}`,()=>{
 const result=execFileSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(fixture),enabled,'full','denied'],{encoding:'utf8'});
 assert.equal(JSON.parse(result.trim()).status,401);
});
