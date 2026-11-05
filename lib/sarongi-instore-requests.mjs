import { SARONGI_OTHER_REQUEST_SKUS } from './sarongi-other-request-skus.mjs';
// Exact reviewed supplier families; activation requires the scoped release.
// This is an ordering
// policy, never a stock quantity, publication permission or prefix override.
export const SARONGI_REQUEST_SKUS = Object.freeze([
  'KANK3101', 'KANK3201', 'KANK3301', 'KANK3401', 'KBEL1001', 'KBRA2003',
  'KBRA2014', 'KBRA2015', 'KBRA2016', 'KBRA2017', 'KBRA2018', 'KBRA2019',
  'KBRA2022', 'KBRA2024', 'KBRA3001', 'KBRA3005', 'KBRA3006', 'KBRA3007',
  'KBRA3008', 'KBRA3009', 'KBRA3010', 'KBRA3011', 'KBRA3012', 'KBRA3013',
  'KBRA3014', 'KBRA3016', 'KBRA3017', 'KBRA3018', 'KBRA3019', 'KBRA3020',
  'KBRA3021', 'KBRA3101', 'KBRA3102', 'KBRA3103', 'KBRA4005', 'KBRA4009',
  'KBRA4010', 'KBRA4011', 'KBRA4012', 'KBRA4013', 'KBRA4018', 'KBRA4019',
  'KBRA4020', 'KBRA4021', 'KBRA4022', 'KBRA4023', 'KBRA4025', 'KBRA4026',
  'KBRA4027', 'KBRA4028', 'KBRA4029', 'KBRA4030', 'KBRA4031', 'KBRA4032',
  'KBRA4033', 'KBRA4034', 'KBRA4035', 'KBRA4040', 'KBRA4041', 'KBRA4043',
  'KBRA4101', 'KBRA4104', 'KBRA4109', 'KBRA4201', 'KBRA4303', 'KBRA4304',
  'KBRA4401', 'KBRA6001', 'KBRA6004', 'KBRA6005', 'KBRA6006', 'KBRA6007',
  'KBRA6008', 'KBRA6009', 'KBRA6011', 'KBRA6101', 'KBRA6201', 'KEAR1016',
  'KEAR1019', 'KEAR1020', 'KEAR1021', 'KEAR1023', 'KEAR1027', 'KEAR1036',
  'KEAR1037', 'KEAR1038', 'KEAR1039', 'KEAR1040', 'KEAR2002', 'KEAR2007',
  'KEAR2008', 'KEAR2009', 'KEAR2012', 'KEAR2013', 'KEAR2014', 'KEAR2015',
  'KEAR2016', 'KEAR2017', 'KEAR2018', 'KEAR3001', 'KEAR3002', 'KNEC1002',
  'KNEC1004', 'KNEC1005', 'KNEC1015', 'KNEC1103', 'KNEC1105', 'KNEC1107',
  'KNEC1201', 'KNEC1202', 'KNEC1301', 'KNEC1302', 'KNEC1401', 'KNEC2001',
  'KNEC2010', 'KNEC2013', 'KNEC2016', 'KNEC2018', 'KNEC3001', 'KNEC3005',
  'KNEC3006', 'KNEC3007', 'KNEC3008', 'KNEC3009', 'KNEC3016', 'KNEC3017',
  'KNEC3101', 'KNEC4001', 'KNEC4011', 'KNEC4012', 'KNEC4014', 'KNEC4015',
  'KNEC4016', 'KNEC4038', 'KNEC4101', 'KPRA1001', 'KPRA1005',

  ...SARONGI_OTHER_REQUEST_SKUS,
]);
const approved = new Set(SARONGI_REQUEST_SKUS);
export function isSarongiRequestSku(sku) {
  return typeof sku === 'string' && approved.has(sku.trim().toUpperCase());
}
export function isSarongiInstoreRequest(product) {
  if (product?.isExtendedRange !== true) return false;
  const sku = String(product.sku || product.id || '').trim().toUpperCase();
  return isSarongiRequestSku(sku);
}
export function sarongiRequestAvailability(sku, availability) {
  // Keep the existing label and the observed stock. Only orderability changes.
  return isSarongiRequestSku(sku) ? { ...availability, canOrder: true } : availability;
}
export function instoreQuantityLimit(product) {
  if (!product?.isExtendedRange || isSarongiInstoreRequest(product)) return 9999;
  return Math.max(0, Math.floor(Number(product.stockOnHand ?? product.stockQty) || 0));
}
