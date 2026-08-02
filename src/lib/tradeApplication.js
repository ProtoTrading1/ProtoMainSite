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
}) {
  const res = await fetch('/api/register-trade', {
    method: 'POST',
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
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Registration failed');
    error.code = data.code || null;
    error.recovery = data.recovery || null;
    throw error;
  }
  return data;
}
