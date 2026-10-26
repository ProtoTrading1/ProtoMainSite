import {normalizeUnitsOfIssue} from './selling-unit.mjs';
const CODE=/^[A-Z0-9][A-Z0-9._/-]{0,63}$/;
/** Pending receiving: negative ONHAND represents sales from this shipment.
 * ONHAND and BOOKED are already in Positill selling units, so do not multiply
 * or divide them by the pack size again. BOOKED is deducted exactly once.
 * Receiving must be verified separately: a positive balance is not a receipt
 * identity and must never silently cause quantities to be added twice.
 */
export function arrivedStockAvailability(arrival,source,{receivingRecorded=false}={}){
  if(!arrival||!CODE.test(arrival.code||'')||!Number.isSafeInteger(arrival.quantity)||arrival.quantity<1||arrival.quantity>1e9
    ||!arrival.units||!source||source.canonicalCode!==arrival.code||!String(source.unitsRaw||'').trim()
    ||normalizeUnitsOfIssue(source.unitsRaw,'')!==arrival.units)throw Error('The exact arrived product and Positill selling unit must agree.');
  const {onHand,booked,available}=source;
  if(!Number.isSafeInteger(onHand)||Math.abs(onHand)>1e9||!Number.isSafeInteger(booked)||booked<0||booked>1e9
    ||!Number.isSafeInteger(available)||available!==onHand-booked)throw Error('Complete current Positill stock and booked quantities are required.');
  if(receivingRecorded!==true&&receivingRecorded!==false)throw Error('Receiving status must be verified.');
  if(receivingRecorded)return {code:arrival.code,units:arrival.units,available:Math.max(0,available),basis:'positill',arrivalAllowanceUsed:false};
  if(onHand>0)throw Error('Confirm receiving before using a positive Positill balance with an arrival allowance.');
  const sold=-Math.min(0,onHand),remaining=Math.max(0,arrival.quantity-sold-booked);
  return {code:arrival.code,units:arrival.units,available:remaining,basis:'arrived-less-positill-sales',arrivalAllowanceUsed:true,arrived:arrival.quantity,sold,booked};
}
