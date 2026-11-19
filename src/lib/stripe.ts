import {loadStripe} from '@stripe/stripe-js';
const token=import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'];
let promise:ReturnType<typeof loadStripe>|null=null;
export function getStripe(){
 if(!token?.startsWith('pk_test_'))throw new Error('Stripe sandbox token is unavailable. Sandbox checkout is required for this project.');
 if(!promise)promise=loadStripe(token);
 return promise;
}
