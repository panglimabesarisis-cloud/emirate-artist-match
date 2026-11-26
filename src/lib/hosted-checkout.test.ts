import {describe,expect,it} from 'vitest';
import {checkoutUrl,hostedCheckoutSettings,hostedReturnUrls,paymentReturnPath} from './hosted-checkout';

describe('sandbox hosted checkout',()=>{
  it('uses the configured hosted fields without collecting phone numbers or double-calculating VAT',()=>{
    expect(hostedCheckoutSettings).toEqual({ui_mode:'hosted_page',billing_address_collection:'auto',phone_number_collection:{enabled:false},automatic_tax:{enabled:false},allow_promotion_codes:false,submit_type:'auto',integration_identifier:'hosted_web_0001',origin_context:'web'});
  });
  it('preserves existing link keys and places order references on the verification return',()=>{
    const urls=hostedReturnUrls('https://dealmakertalent.com/booking/booking-1?k=private-link',{orderId:'order-1'});
    const success=new URL(urls.success_url);
    expect(success.pathname).toBe('/checkout-return');
    expect(success.searchParams.get('orderId')).toBe('order-1');
    expect(success.searchParams.get('returnTo')).toBe('/booking/booking-1?k=private-link');
    expect(success.searchParams.get('session_id')).toBe('{CHECKOUT_SESSION_ID}');
    expect(urls.success_url).toContain('{CHECKOUT_SESSION_ID}');
    expect(urls.cancel_url).toBe('https://dealmakertalent.com/booking/booking-1?k=private-link');
  });
  it('routes subscriptions back through verification, not a browser-granted entitlement',()=>{
    const success=new URL(hostedReturnUrls('https://dealmakertalent.com/dashboard',{subscription:true}).success_url);
    expect(success.searchParams.get('subscription')).toBe('true');
    expect(success.searchParams.get('returnTo')).toBe('/dashboard');
    expect(success.searchParams.has('orderId')).toBe(false);
  });
  it('blocks live sessions even when they have a Stripe-hosted URL',()=>{
    expect(()=>checkoutUrl({id:'cs_live_example',livemode:true,url:'https://checkout.stripe.com/c/pay/example'})).toThrow('Live checkout is disabled');
  });
  it('requires a verified test-session identifier',()=>{
    expect(()=>checkoutUrl({id:'cs_live_example',livemode:false,url:'https://checkout.stripe.com/c/pay/example'})).toThrow('Live checkout is disabled');
  });
  it('requires a returned hosted URL',()=>{
    expect(()=>checkoutUrl({id:'cs_test_example',livemode:false,url:null})).toThrow('did not return');
  });
  it('blocks non-Stripe redirects',()=>{
    for(const url of ['https://evil.example/','http://checkout.stripe.com/','https://checkout.stripe.com.evil.example/','https://user:pass@checkout.stripe.com/']){
      expect(()=>checkoutUrl({id:'cs_test_example',livemode:false,url})).toThrow('Invalid Stripe checkout URL');
    }
    expect(checkoutUrl({id:'cs_test_example',livemode:false,url:'https://checkout.stripe.com/c/pay/example'})).toBe('https://checkout.stripe.com/c/pay/example');
  });
  it('blocks external and unsupported return destinations',()=>{
    for(const path of ['//evil.example/','https://evil.example/','/\\evil.example/','/admin','/checkout-return'])expect(()=>paymentReturnPath(path)).toThrow('Invalid payment return destination');
    expect(paymentReturnPath('/chat/chat-1?k=link')).toBe('/chat/chat-1?k=link');
    expect(paymentReturnPath('/ai/dede-fajar')).toBe('/ai/dede-fajar');
    for(const path of ['/ai/','/ai/a/b','/ai/../admin'])expect(()=>paymentReturnPath(path)).toThrow('Invalid payment return destination');
  });
});