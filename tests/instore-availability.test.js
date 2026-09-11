import test from 'node:test';
import assert from 'node:assert/strict';
import {isInstoreAvailable} from '../src/lib/instoreAvailability.js';
test('production domains keep Instore paused',()=>{
  for(const host of ['proto.co.za','www.proto.co.za','prototrading.co.za','www.prototrading.co.za','register.proto.co.za','']) assert.equal(isInstoreAvailable(host),false);
});
test('preview and local development stay available',()=>{
  for(const host of ['protoportal-main-6jmqclxua-proto-team.vercel.app','localhost','127.0.0.1']) assert.equal(isInstoreAvailable(host),true);
});
