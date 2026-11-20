import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn(), send: vi.fn(), writes: [] as Record<string, unknown>[], outcome: 'ready', claim: true, reserved: true }));
vi.mock('@lovable.dev/ai-gateway', () => ({generateResponse:mocks.generate,GatewayError:class extends Error{}}));
vi.mock('./whatsapp-provider.server', () => ({sendWhatsApp:mocks.send}));
vi.mock('@/integrations/supabase/client.server', () => ({supabaseAdmin:{rpc:mocks.rpc,from:()=>{
  const chain={select:()=>chain,eq:()=>chain,update:(value:Record<string,unknown>)=>{mocks.writes.push(value);return chain;},
    single:async()=>({data:{id:'event-1',booking_id:'booking-1',sender:'971501234567',outcome:mocks.outcome,message:'Ubah harga jadi AED 7,000, tambah notes: biaya transport'},error:null}),
    then:(resolve:(value:unknown)=>void)=>resolve({data:null,error:null})};return chain;
}}}));
import { processWhatsAppRevision } from './whatsapp-revision.server';

beforeEach(()=>{
  vi.clearAllMocks();mocks.writes.length=0;mocks.outcome='ready';mocks.claim=true;mocks.reserved=true;
  mocks.generate.mockResolvedValue({output:[{type:'message',content:[{type:'output_text',text:'{"amount":7000,"note":"biaya transport"}'}]}]});
  mocks.send.mockResolvedValue({status:'accepted',messageId:'fonnte:test'});
  mocks.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='claim_fonnte_revision'?(mocks.claim?{outcome:mocks.outcome}:null):name==='reserve_fonnte_revision_credit'?mocks.reserved:{outcome:'revised',amount:7000,total:7350}}));
});
describe('verified artist revision processing',()=>{
  it('extracts a replacement price, applies it atomically and replies without approving',async()=>{
    await processWhatsAppRevision('event-1');
    expect(mocks.rpc).toHaveBeenCalledWith('apply_fonnte_revision_change',{_event:'event-1',_changes:{amount:7000,note:'biaya transport'}});
    expect(mocks.rpc.mock.calls.some(([name])=>name==='apply_fonnte_approval')).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.writes).toContainEqual({state:'done',reply_status:'accepted',reply_id:'fonnte:test'});
  });
  it('does not infer or mutate an ambiguous booking',async()=>{
    mocks.outcome='ambiguous';await processWhatsAppRevision('event-1');
    expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not modify locked invoices or paid bookings',async()=>{
    mocks.outcome='locked';await processWhatsAppRevision('event-1');
    expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not replay a claimed or completed provider event',async()=>{
    mocks.claim=false;await processWhatsAppRevision('event-1');
    expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not use AI or mutate bookings when credit reservation fails',async()=>{
    mocks.reserved=false;await processWhatsAppRevision('event-1');
    expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('never applies an invented price',async()=>{
    mocks.generate.mockResolvedValue({output:[{type:'message',content:[{type:'output_text',text:'{"amount":9000,"note":null}'}]}]});
    await processWhatsAppRevision('event-1');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('records ambiguous sends for review, not blind retries',async()=>{
    mocks.send.mockResolvedValue({status:'failed'});await processWhatsAppRevision('event-1');
    expect(mocks.writes).toContainEqual({state:'unresolved',reply_status:'failed',reply_id:null});
  });
});