import {reminderDue,bookingPayment} from './booking-payment-rules';
export async function runBookingJobs(origin:string) {
 const {recoverFonnteEvents}=await import('./fonnte-webhook.server');
 await recoverFonnteEvents(origin);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {syncBookingCalendar}=await import('./booking-calendar.server');
 const {notifyBooking}=await import('./notify.server');
 const {data:pending}=await db.from('bookings').select('id').eq('status','confirmed').in('calendar_sync_status',['pending','failed']).limit(10);
 for(const b of pending??[])await syncBookingCalendar(b.id);
 const eventDate=new Date(Date.now()+4*3600000+7*86400000).toISOString().slice(0,10);
 const {data:rows,error}=await db.from('bookings').select('id,event_date,status,total,paid_amount,client_phone,client_email,access_key,package_title,reminder_claimed_at').eq('status','confirmed').eq('event_date',eventDate).is('reminder_sent_at',null).gt('paid_amount',0).limit(200);
 if(error)throw error;
 for(const b of rows??[]){
  if(!reminderDue(b.event_date,b.status,Number(b.total),Number(b.paid_amount))||b.reminder_claimed_at)continue;
  const {data:claimed}=await db.from('bookings').update({reminder_claimed_at:new Date().toISOString()}).eq('id',b.id).is('reminder_claimed_at',null).select('id').maybeSingle();
  if(!claimed)continue;
  await notifyBooking(b.id,'client','balance_h7',{phone:b.client_phone,email:b.client_email},'Booking balance due in 7 days',`${b.package_title} on ${b.event_date}. Remaining balance AED ${bookingPayment(Number(b.total),Number(b.paid_amount),20).balance}. Please pay through your booking link.`,`${origin}/booking/${b.id}?k=${b.access_key}`);
  const {data:accepted}=await db.from('notifications').select('id').eq('booking_id',b.id).eq('kind','balance_h7').eq('channel','whatsapp').in('status',['sent','accepted','delivered','read']).limit(1).maybeSingle();
  await db.from('bookings').update(accepted?{reminder_sent_at:new Date().toISOString()}:{reminder_claimed_at:null}).eq('id',b.id);
 }
}
