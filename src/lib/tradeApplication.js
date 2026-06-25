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
  vatNumber,
  country,
  province,
  city,
  businessType,
  monthlySpend,
  website,
  acceptWhatsapp,
  customerCode,
  instantApproval,
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
      vatNumber,
      country,
      province,
      city,
      businessType,
      monthlySpend,
      website,
      acceptWhatsapp,
      customerCode,
      instantApproval,
      company_fax,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}
