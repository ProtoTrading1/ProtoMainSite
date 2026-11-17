// These Showroom products have confirmed physical stock while receiving is pending.
const receivedShowroomSkus = new Set([
  'MKB240119', 'MKB240182', 'MKB240254', 'MKB240398', 'MKB240425',
  'MKB392390', 'MKB417869', 'MKB449864', 'MKB477278', 'MKB477287',
  'MKB513611', 'MKL847490', 'MKL987260', 'MKN185223', 'MKN986034',
  'MKP448849', 'MKQ419220', 'MKQ942075', 'MKR797381', 'MKT3551328',
  'MKT3551346', 'MKT5200326', 'MKT7024932', 'MKT9712026', 'MKTC272526',
  'MKTF201432', 'MKTF639273', 'MKTG805466', 'MKTH455229', 'MKTI344753',
  'MKTI925955', 'MKTI986957', 'MKTJ006766', 'MKTJ463939', 'MKTJ562714',
  'MKTJ562732', 'MKTJ562741', 'MKU314807', 'MKW719283', 'MKX217154',
  'MKB378350', 'MKB421946', 'MKB421964', 'MKB450044', 'MKB454913',
  'MKB455003', 'MKB478664', 'MKB487061', 'MKB495422', 'MKB495431',
  'MKT645585', 'MKV177268', 'MKW657957', 'MKW675759', 'MKW675768',
  'MKY493408',
]);

export function showroomAvailabilityGuidance(product, availability) {
  const sku = product.sku || product.id || product.code;
  if (!product.isExtendedRange && !product.isVariantGroup && receivedShowroomSkus.has(sku)
    && availability.state === 'landed' && availability.incomingStatus === 'landed_awaiting_grv'
    && availability.canOrder === true) {
    return null;
  }
  return availability.guidance;
}
