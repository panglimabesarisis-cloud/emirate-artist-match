import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({event:{id:'event-1',booking_id:'booking-1',outcome:'approved',sender:'971501234567',processed_at:null as string|null,effects_state:'pending',effects_started_at:null as string|null},claim:true,rpc:vi.fn(),finish:vi.fn(),send:vi.fn(),writes:[] as Record<string,unknown>[]}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:mocks.rpc,from:(table:string)=>{
  const query={select:()=>query,eq:()=>query,update:(value:Record<string,unknown>)=>{mocks.writes.push(value);return query;},single:async()=>({data:table==='bookings'?{artist_key:'fixture-key'}:mocks.event,error:null}),maybeSingle:async()=>({data:mocks.claim?{id:'event-1'}:null,error:null}),then:(resolve:(value:unknown)=>void)=>resolve({data:null,error:null})};return query;
}}}));
vi.mock('./booking-decision.server',()=>({finishWhatsAppDecision:mocks.finish}));
vi.mock('./whatsapp-provider.server',()=>({sendWhatsApp:mocks.send}));
import {processFonnteEvent} from './fonnte-webhook.server';

beforeEach(()=>{
  vi.clearAllMocks();mocks.writes.length=0;mocks.claim=true;
  Object.assign(mocks.event,{outcome:'approved',processed_at:null,effects_state:'pending',effects_started_at:null});
  mocks.rpc.mockResolvedValue({data:'approved',error:null});mocks.finish.mockResolvedValue(undefined);mocks.send.mockResolvedValue({status:'accepted',messageId:'fonnte:fixture'});
});
describe('durable Fonnte processing',()=>{
  it('applies atomic approval before resuming the YES branch',async()=>{
    await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.rpc).toHaveBeenCalledWith('apply_fonnte_approval',{_event:'event-1'});
    expect(mocks.finish).toHaveBeenCalledWith('booking-1','yes');
    expect(mocks.writes).toContainEqual({reply_status:'accepted',reply_id:'fonnte:fixture'});
  });
  it('resumes the NO branch after decline',async()=>{
    mocks.event.outcome='declined';await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.finish).toHaveBeenCalledWith('booking-1','no');
  });
  it('does not auto-approve draft invoice items',async()=>{
    mocks.event.outcome='invoice_required';await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not choose a booking for ambiguous replies',async()=>{
    mocks.event.outcome='ambiguous';await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('does not replay completed effects',async()=>{
    mocks.event.processed_at='2026-11-20T15:00:00Z';await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('requires an exclusive claim before sending or resuming',async()=>{
    mocks.claim=false;await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous confirmation send',async()=>{
    mocks.send.mockResolvedValue({status:'failed'});
    await expect(processFonnteEvent('event-1','https://dealmakertalent.com')).rejects.toThrow('Fonnte workflow incomplete');
    expect(mocks.writes.some(w=>w['effects_state']==='unresolved')).toBe(true);
    mocks.event.effects_state='unresolved';await processFonnteEvent('event-1','https://dealmakertalent.com');
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not run follow-ups after transaction failure',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:new Error('transaction failed')});
    await expect(processFonnteEvent('event-1','https://dealmakertalent.com')).rejects.toThrow('transaction failed');
    expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
});