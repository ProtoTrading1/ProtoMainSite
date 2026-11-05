import { safeServerRegistrationFields } from './registrationServerGuidance.mjs';
import { isConfirmedTradeApplication } from './registrationResult.mjs';
import { requestJson } from './requestDeadline.mjs';

export async function submitTradeApplication({
  email,
  username,
  password,
  confirmPassword,
  contactName,
  businessName,
  phone,
  companyAddress,
  deliveryAddress,
  streetName,
  suburb,
  postalCode,
  buildingType,
  unitNumber,
  vatNumber,
  country,
  province,
  city,
  businessType,
  salesChannels,
  productCategories,
  otherProductCategory,
  businessDescription,
  monthlySpend,
  website,
  acceptWhatsapp,
  customerCode,
  company_fax,
}, { signal } = {}) {
  const result = await requestJson('/api/register-trade', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      username,
      password,
      confirmPassword,
      contactName,
      businessName,
      phone,
      companyAddress,
      deliveryAddress,
      streetName,
      suburb,
      postalCode,
      buildingType,
      unitNumber,
      vatNumber,
      country,
      province,
      city,
      businessType,
      salesChannels,
      productCategories,
      otherProductCategory,
      businessDescription,
      monthlySpend,
      website,
      acceptWhatsapp,
      customerCode,
      company_fax,
    }),
  }, {
    timeoutMs: 25_000,
    message: 'We could not confirm your application. Check your email for confirmation before trying again. Your form is still here.',
  }).catch(error => {
    if (error.status === 400 && error.code === 'REGISTRATION_VALIDATION_FAILED') {
      const fields = safeServerRegistrationFields(error.data?.fieldErrors);
      if (fields?.password) error.message = fields.password;
    }
    throw error;
  });
  if (!isConfirmedTradeApplication(result)) {
    throw Object.assign(new Error('We could not confirm your registration. Contact Proto before submitting again.'), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  }
  return result;
}
