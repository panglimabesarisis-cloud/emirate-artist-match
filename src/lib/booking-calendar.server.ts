import { calendarWindow } from './calendar-rules';
/** Deterministic Google event IDs make retries safe after ambiguous responses. */
export async function syncBookingCalendar(bookingId:string) {
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:b}=await db.from('bookings').select('*,artists(user_id,stage_name)').eq('id',bookingId).single();
 if(!b||b.status!=='confirmed'||Number(b.paid_amount)<=0||b.calendar_event_id)return;
 try {
  if(!b.artists?.user_id||!b.start_time||!b.end_time)throw new Error('Calendar requires artist connection and event hours');
  const {getConnectionKeyForUser}=await import('./appUserConnections.server');
  const {callAsAppUser}=await import('@/integrations/lovable/appUserConnector');
  const key=await getConnectionKeyForUser(b.artists.user_id,'google_calendar');
  if(!key)throw new Error('Reconnect Google Calendar with permission to add events');
  const window=calendarWindow({date:b.event_date,startTime:b.start_time.slice(0,5),endTime:b.end_time.slice(0,5)});
  const eventId='dm'+b.id.replaceAll('-','');
  const res=await callAsAppUser({gatewayBaseUrl:'https://connector-gateway.lovable.dev',connectorId:'google_calendar',connectionAPIKey:key,path:'/calendar/v3/calendars/primary/events',requiredScopes:['https://www.googleapis.com/auth/calendar.events'],init:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:eventId,summary:`${b.artists.stage_name} · ${b.package_title ?? 'Booking'}`,description:`Client: ${b.client_name}\nJob detail: ${b.job_detail ?? b.notes ?? ''}\nGuests: ${b.guests ?? '-'}\nPaid AED ${b.paid_amount} / ${b.total}\nBooking: ${b.id}`,start:{dateTime:window.timeMin,timeZone:'Asia/Dubai'},end:{dateTime:window.timeMax,timeZone:'Asia/Dubai'}})}});
  if(!res.ok&&res.status!==409){const body=await res.text();console.error('Calendar write failed',res.status,body);throw new Error(`Google Calendar could not add the event (${res.status}); reconnect with event permission`);}
  const {error}=await db.from('bookings').update({calendar_event_id:eventId,calendar_sync_status:'synced',calendar_sync_error:null}).eq('id',b.id);
  if(error)throw error;
 }catch(e){await db.from('bookings').update({calendar_sync_status:'failed',calendar_sync_error:(e instanceof Error?e.message:'Calendar sync failed').slice(0,500)}).eq('id',b.id);}
}
