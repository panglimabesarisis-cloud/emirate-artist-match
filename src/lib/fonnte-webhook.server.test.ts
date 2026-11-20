import { webcrypto } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { authenticateFonnte } from './fonnte-webhook.server';

const fixtureSecret='fonnte-test-only-shared-secret';
const fixture={secret:fixtureSecret,device:'628123456789',sender:'0501234567',message:'YES a1234567',member:'',inboxid:'fixture-1',timestamp:Math.floor(Date.now()/1000)};
const request=(payload:unknown)=>new Request('http://localhost/api/public/whatsapp/fonnte-webhook',{method:'POST',body:JSON.stringify(payload)});
beforeAll(()=>vi.stubGlobal('crypto',webcrypto));
afterAll(()=>vi.unstubAllGlobals());

describe('authenticated Fonnte webhook',()=>{
  it('fails closed when no shared secret is configured',async()=>expect(await authenticateFonnte(request(fixture),undefined)).toEqual({error:'Not configured',status:503}));
  it('rejects incorrect shared secret',async()=>expect(await authenticateFonnte(request({...fixture,secret:'incorrect-fixture-secret'}),fixtureSecret)).toEqual({error:'Unauthorized',status:401}));
  it('accepts and normalizes a verified UAE artist reply',async()=>{
    const result=await authenticateFonnte(request(fixture),fixtureSecret);
    expect(result.event).toEqual({delivery_id:'628123456789:fixture-1',sender:'971501234567',decision:'yes',reference:'a1234567',message_at:new Date(fixture.timestamp*1000).toISOString()});
    expect(JSON.stringify(result)).not.toContain(fixtureSecret);
  });
  it('ignores replies from group members',async()=>expect(await authenticateFonnte(request({...fixture,member:'628111111111'}),fixtureSecret)).toEqual({ignored:true}));
  it('ignores unrelated chat text',async()=>expect(await authenticateFonnte(request({...fixture,message:'Hello there'}),fixtureSecret)).toEqual({ignored:true}));
  it('ignores stale replies',async()=>expect(await authenticateFonnte(request({...fixture,timestamp:fixture.timestamp-3600}),fixtureSecret)).toEqual({ignored:true}));
  it('ignores future-dated replies',async()=>expect(await authenticateFonnte(request({...fixture,timestamp:fixture.timestamp+3600}),fixtureSecret)).toEqual({ignored:true}));
  it('requires a provider inbox ID for replay protection',async()=>expect(await authenticateFonnte(request({...fixture,inboxid:''}),fixtureSecret)).toEqual({error:'Invalid payload',status:400}));
  it('bounds request bodies before parsing',async()=>expect(await authenticateFonnte(request({...fixture,message:'x'.repeat(40000)}),fixtureSecret)).toEqual({error:'Payload too large',status:413}));
});