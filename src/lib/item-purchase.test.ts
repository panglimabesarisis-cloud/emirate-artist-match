import {describe,it,expect} from 'vitest';
import {itemAmountMinor,tierAllowed} from './billing-rules';
describe('paid library items',()=>{
 it('charges price plus 5% VAT in minor units',()=>expect(itemAmountMinor(49)).toBe(5145));
 it('rejects free items at checkout',()=>expect(()=>itemAmountMinor(0)).toThrow());
 it('blocks items above the artist plan tier',()=>{expect(tierAllowed('basic','medium')).toBe(false);expect(tierAllowed('pro','medium')).toBe(true);});
});
