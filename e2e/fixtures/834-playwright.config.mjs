import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:'../../tests/preview',testMatch:'834.spec.js',fullyParallel:false,workers:1,use:{baseURL:'http://127.0.0.1:5298',screenshot:'only-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1200,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}],webServer:{command:'node e2e/fixtures/serve-834-preview.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:5298/e2e/fixtures/834.html',reuseExistingServer:true}});
