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
  it('accepts standard payload without body secret using dedicated URL credential',async()=>{
    const {secret: _secret,...payload}=fixture;
    const req=new Request(`http://localhost/api/public/whatsapp/fonnte-webhook?secret=${fixtureSecret}`,{method:'POST',body:JSON.stringify(payload)});
    const result=await authenticateFonnte(req,fixtureSecret);
    expect(result.event?.decision).toBe('yes');
    expect(JSON.stringify(result)).not.toContain(fixtureSecret);
  });
  it('accepts a dedicated header credential without a body secret',async()=>{
    const {secret: _secret,...payload}=fixture;
    const req=new Request('http://localhost/api/public/whatsapp/fonnte-webhook',{method:'POST',headers:{'x-fonnte-webhook-secret':fixtureSecret},body:JSON.stringify(payload)});
    expect((await authenticateFonnte(req,fixtureSecret)).event?.sender).toBe('971501234567');
  });
  it('rejects a standard payload without authentication even with a known device',async()=>{
    const {secret: _secret,...payload}=fixture;
    expect(await authenticateFonnte(request(payload),fixtureSecret)).toEqual({error:'Unauthorized',status:401});
  });
  it('never uses the outbound API token query parameter as authentication',async()=>{
    const {secret: _secret,...payload}=fixture;
    const req=new Request(`http://localhost/api/public/whatsapp/fonnte-webhook?token=${fixtureSecret}`,{method:'POST',body:JSON.stringify(payload)});
    expect(await authenticateFonnte(req,fixtureSecret)).toEqual({error:'Unauthorized',status:401});
  });
  it('rejects conflicting credentials rather than bypassing an incorrect body secret',async()=>{
    const req=new Request(`http://localhost/api/public/whatsapp/fonnte-webhook?secret=${fixtureSecret}`,{method:'POST',body:JSON.stringify({...fixture,secret:'incorrect-fixture-secret'})});
    expect(await authenticateFonnte(req,fixtureSecret)).toEqual({error:'Unauthorized',status:401});
  });
  it('rejects duplicate URL credentials',async()=>{
    const req=new Request(`http://localhost/api/public/whatsapp/fonnte-webhook?secret=${fixtureSecret}&secret=${fixtureSecret}`,{method:'POST',body:JSON.stringify(fixture)});
    expect(await authenticateFonnte(req,fixtureSecret)).toEqual({error:'Unauthorized',status:401});
  });
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