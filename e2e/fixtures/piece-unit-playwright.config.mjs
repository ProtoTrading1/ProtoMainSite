import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'../',testMatch:'piece-unit-stock.spec.js',workers:1,fullyParallel:false,projects:[{name:'desktop',use:{viewport:{width:1200,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]});
