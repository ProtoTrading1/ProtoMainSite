import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'../../tests/preview',testMatch:'hidden-instore-stock.spec.js',workers:1,use:{baseURL:'http://127.0.0.1:5395'},projects:[{name:'desktop',use:{viewport:{width:1200,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],webServer:{command:'node e2e/fixtures/serve-hidden-instore-stock.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:5395/e2e/fixtures/hidden-instore-stock.html',reuseExistingServer:true}});
