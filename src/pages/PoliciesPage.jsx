import { useState, useEffect } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import ProtoLogo from '../components/ProtoLogo';

const POLICIES = [
  {
    id: 'returns',
    label: 'Returns',
    title: 'Returns Policy',
    date: 'Effective Date: 1 June 2026',
    sections: [
      {
        heading: 'General Policy',
        body: `Proto Trading is a wholesale importer and distributor supplying products primarily to businesses, retailers, schools, organisations, and commercial customers. All sales are considered final once processed. Customers are responsible for ensuring products are fit for their intended purpose before purchase.

Returns are not accepted for the following:

• Incorrectly ordered items
• Surplus or excess stock
• Slow-moving inventory
• Changes in business plans or requirements`,
      },
      {
        heading: 'Management Approval Required',
        body: `Any request for a credit note or return must be reviewed and approved by management. No credit may be issued or return accepted without prior written approval from management. Requests submitted without approval will not be processed.`,
      },
      {
        heading: 'Authorised Returns',
        body: `Where a return has been approved, goods must be returned in their original, undamaged packaging. Handling fees and replacement costs may apply and will be communicated at the time of approval.`,
      },
      {
        heading: 'Shortages, Damage or Defects',
        body: `All goods must be inspected immediately upon receipt. Any shortages, damage, or defects must be reported in writing within 7 calendar days of delivery. Claims submitted after this period will not be considered.`,
      },
      {
        heading: 'Non-Returnable Products',
        body: `The following categories are non-returnable under any circumstances:

• Discontinued product lines
• Stationery items
• Cosmetics and beauty products
• Hygiene-related items
• Personal use items`,
      },
      {
        heading: 'Remedies',
        body: `Where a return or credit is approved, Proto Trading may, at its discretion, offer one of the following remedies:

• Replacement of the affected goods
• An alternative product of comparable value

Refunds are not offered.`,
      },
      {
        heading: 'Contact Details',
        body: `Email: online@proto.co.za
Telephone: +27 21 461 5883
Address: De Roos Street, Off Sir Lowry Road, District Six, Cape Town, South Africa

Proudly serving trade customers since 1987.`,
      },
    ],
  },
  {
    id: 'shipping',
    label: 'Shipping',
    title: 'Shipping & Delivery Policy',
    date: 'Effective Date: 1 June 2026',
    sections: [
      {
        heading: 'Overview',
        body: `Proto Trading is committed to delivering orders efficiently and accurately. This policy explains how collections and deliveries are handled.`,
      },
      {
        heading: 'Collections',
        body: `Customers may collect orders directly from our premises during business hours. You will be notified when your order is ready for collection. Orders must be collected within a reasonable period of notification — uncollected orders may be cancelled. Proof of identity may be required at the time of collection.`,
      },
      {
        heading: 'Deliveries',
        body: `Where delivery is arranged, Proto Trading uses third-party couriers, transport companies, or other nominated carriers. Dispatch timeframes provided are estimates only and are not guaranteed. Delivery dates may be affected by factors outside our control.`,
      },
      {
        heading: 'Delays',
        body: `Proto Trading shall not be held liable for delays caused by any of the following:

• Load shedding or power outages
• Severe weather events
• Civil unrest or road closures
• Any circumstances beyond our reasonable control`,
      },
      {
        heading: 'Risk and Ownership',
        body: `Risk in the goods passes to the customer upon collection from our premises or upon handover to the nominated courier for delivery. Ownership of goods remains with Proto Trading until payment has been received and cleared in full.`,
      },
      {
        heading: 'Delivery Address',
        body: `Customers are responsible for providing correct and complete delivery details at the time of order. Proto Trading shall not be liable for delays, failed deliveries, or additional costs arising from incorrect or incomplete address information submitted by the customer.`,
      },
      {
        heading: 'Inspection of Goods',
        body: `All deliveries must be inspected upon receipt. Any shortages or delivery discrepancies must be reported in writing within 7 calendar days of delivery. Claims submitted after this period will not be considered.`,
      },
      {
        heading: 'Stock Availability',
        body: `All products are offered subject to availability. Proto Trading reserves the right to fulfil partial orders or cancel orders where stock is unavailable.`,
      },
      {
        heading: 'Special Orders',
        body: `Products that are specially sourced or made-to-order are subject to extended lead times and additional conditions. These will be communicated at the time of order.`,
      },
      {
        heading: 'Contact Details',
        body: `Telephone: +27 21 461 5883
Address: De Roos Street, Off Sir Lowry Road, District Six, Cape Town, South Africa`,
      },
    ],
  },
  {
    id: 'terms',
    label: 'Terms & Conditions',
    title: 'Terms & Conditions',
    date: 'Effective Date: 1 June 2026',
    sections: [
      {
        heading: 'Wholesale Business',
        body: `Proto Trading is a business-to-business wholesale supplier. Trade access is reserved for registered businesses, retailers, resellers, and approved commercial customers. Proto Trading reserves the right to approve, decline, suspend, or terminate customer accounts at its sole discretion.`,
      },
      {
        heading: 'Payment',
        body: `Unless otherwise agreed in writing by management, all orders must be paid in full prior to collection or dispatch. Ownership of goods remains with Proto Trading until payment has been received and cleared in full.`,
      },
      {
        heading: 'Products and Availability',
        body: `Products are offered subject to availability. Adding items to a basket or quote request does not reserve stock. Proto Trading reserves the right to allocate available stock amongst customers during periods of short supply or high demand.`,
      },
      {
        heading: 'Product Variations',
        body: `Product specifications, colours, materials, packaging, labels, dimensions, finishes, brand names, and designs may vary from those displayed on the website or in catalogues. Such variations do not constitute a breach of contract or grounds for a return.`,
      },
      {
        heading: 'Pricing',
        body: `All prices are quoted in South African Rand (ZAR). Prices are subject to correction in the event of technical errors. Quoted prices are valid for 7 calendar days from the date of issue unless otherwise stated in writing.`,
      },
      {
        heading: 'Special Orders',
        body: `Special orders — including items sourced on request or manufactured to specification — may not be cancelled once production or procurement has commenced.`,
      },
      {
        heading: 'Inspection of Goods',
        body: `Customers must inspect all goods immediately upon receipt. Any damage, shortages, or discrepancies must be reported in writing within 7 calendar days of delivery. Claims submitted after this period will not be accepted.`,
      },
      {
        heading: 'Returns, Cancellations and Credit',
        body: `Returns are not accepted for unwanted, surplus, or slow-moving stock, or for change-of-mind purchases. Any returns or credit notes require prior written approval from management. Approved returns are subject to the Returns Policy.`,
      },
      {
        heading: 'Uncollected Goods',
        body: `Where goods are not collected from Proto Trading's premises within a reasonable period, Proto Trading reserves the right to return the goods to stock or otherwise dispose of them. No liability will be accepted for uncollected goods after a reasonable holding period has elapsed.`,
      },
      {
        heading: 'Website Use',
        body: `Users may not attempt unauthorised access to Proto Trading's systems, upload malicious software, or reproduce or copy content from the portal without written permission.`,
      },
      {
        heading: 'Force Majeure',
        body: `Proto Trading shall not be liable for any failure to perform its obligations where such failure results from circumstances beyond its reasonable control, including but not limited to load shedding, civil unrest, natural disasters, or government action. Proto Trading's total liability is limited to the value of the affected goods.`,
      },
      {
        heading: 'Governing Law',
        body: `These terms and conditions are governed by the laws of the Republic of South Africa. Any disputes shall be subject to the jurisdiction of the Western Cape Division of the High Court of South Africa.`,
      },
      {
        heading: 'Contact Details',
        body: `Email: online@proto.co.za
Telephone: +27 21 461 5883
Address: De Roos Street, Off Sir Lowry Road, District Six, Cape Town, South Africa

Established 1987.`,
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy Policy',
    title: 'Privacy Policy',
    date: 'Last Updated: 1 June 2026',
    sections: [
      {
        heading: 'Introduction',
        body: `Proto Trading CC (Registration No: 1987/019529/23) respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, share, and protect your personal information when you use our website, create an account, request a quote, place an order, subscribe to communications, or otherwise interact with us.

Proto Trading complies with the Protection of Personal Information Act 4 of 2013 (POPIA) and all applicable South African data protection laws.`,
      },
      {
        heading: 'Who We Are',
        body: `Proto Trading CC is an established wholesale importer and distributor, supplying products across multiple categories to retailers, businesses, schools, and trade customers throughout South Africa and the wider SADC region. We have been in business since 1987.`,
      },
      {
        heading: 'Information You Provide',
        body: `We collect personal information that you voluntarily provide when registering or interacting with us. This includes:

• Full name and surname
• Company or business name
• Email address
• Telephone number
• Physical and delivery addresses
• VAT registration number (if applicable)
• Business type and trading details`,
      },
      {
        heading: 'Information Collected Automatically',
        body: `When you use our website or portal, certain information may be collected automatically, including:

• Browser type and version
• Operating system
• Pages visited and time spent on pages
• Usage and click-through statistics
• Geographic location (country/city level)`,
      },
      {
        heading: 'How We Use Your Information',
        body: `Your information is used to:

• Process and fulfil trade orders and quote requests
• Verify trade account applications
• Send order confirmations and account notifications
• Prevent fraud and meet regulatory obligations
• Improve our website and portal experience
• Send relevant product and promotional communications (with your consent)`,
      },
      {
        heading: 'Sharing With Third Parties',
        body: `Proto Trading does not sell your personal information. We may share information with trusted third parties where necessary to operate our business, including:

• Courier and logistics companies (for delivery)
• Payment processors (for order payments)
• Communication platforms (for notifications and special offers, with your consent)
• Analytics providers (for understanding website usage)

All third parties are required to handle your data in compliance with applicable South African data protection laws.`,
      },
      {
        heading: 'Your Rights',
        body: `Under POPIA, you have the right to:

• Access the personal information we hold about you
• Request correction of inaccurate or outdated information
• Request the deletion of your personal information (subject to legal obligations)
• Withdraw consent for marketing communications at any time
• Lodge a complaint with the Information Regulator of South Africa`,
      },
      {
        heading: 'Data Security',
        body: `We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, loss, or misuse. While no system can be completely secure, we continuously review and improve our security practices.`,
      },
      {
        heading: 'Children',
        body: `Our services are intended for business use only. We do not knowingly collect personal information from individuals under the age of 18.`,
      },
      {
        heading: 'Contact Us',
        body: `For any privacy-related queries, requests, or complaints, please contact us:

Email: online@proto.co.za
Telephone: +27 21 461 5883
Address: De Roos Street, Off Sir Lowry Road, District Six, Cape Town, South Africa
Website: proto.co.za

Proudly serving trade customers since 1987.`,
      },
    ],
  },
];

export default function PoliciesPage({ onLogin }) {
  const hash = window.location.hash;
  const hashId = hash.replace('#/policies/', '').replace('#/policies', '');
  const initial = POLICIES.find((p) => p.id === hashId) ?? POLICIES[0];
  const [active, setActive] = useState(initial.id);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);

  const policy = POLICIES.find((p) => p.id === active);

  return (
    <div className="access-page" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <header className="access-header">
        <div className="access-brand">
          <ProtoLogo variant="full" size="lg" tagline={false} />
        </div>
        <nav className="access-nav" aria-label="Policies navigation">
          <a
            href="#/"
            onClick={(e) => { e.preventDefault(); window.location.hash = ''; }}
            style={{ color: '#a8b3c7', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
          >
            <ArrowLeft size={15} />
            Back to home
          </a>
        </nav>
        <div className="access-actions">
          {onLogin && (
            <button className="access-login" type="button" onClick={onLogin}>
              <Lock size={16} />
              Sign in
            </button>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Page title */}
        <div style={{ marginBottom: 36 }}>
          <span style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            color: '#8B1A1A',
            marginBottom: 10,
          }}>
            Legal &amp; Policies
          </span>
          <h1 style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: 'clamp(26px, 5vw, 38px)',
            fontWeight: 800,
            color: '#fff',
            margin: 0,
            lineHeight: 1.2,
          }}>
            Proto Trading Policies
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 10 }}>
            All policies are effective as of June 2026. For questions, contact us at online@proto.co.za.
          </p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 40,
          paddingBottom: 0,
        }}>
          {POLICIES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: active === p.id ? '2px solid #dc2626' : '2px solid transparent',
                color: active === p.id ? '#fff' : '#64748b',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Policy content */}
        <div style={{ color: '#e2e8f0' }}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: 'clamp(20px, 4vw, 26px)',
              fontWeight: 800,
              color: '#fff',
              margin: '0 0 6px',
            }}>
              {policy.title}
            </h2>
            <p style={{ color: '#475569', fontSize: 13, fontWeight: 600, margin: 0 }}>{policy.date}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {policy.sections.map((section, i) => (
              <div
                key={i}
                style={{
                  padding: '24px 0',
                  borderBottom: i < policy.sections.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
              >
                <h3 style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#dc2626',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  margin: '0 0 12px',
                }}>
                  {section.heading}
                </h3>
                <div style={{ fontSize: 15, lineHeight: 1.75, color: '#cbd5e1', whiteSpace: 'pre-line' }}>
                  {section.body}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom nav */}
        <div style={{ marginTop: 56, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {POLICIES.filter((p) => p.id !== active).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(p.id)}
              style={{
                padding: '9px 16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#94a3b8',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            >
              {p.label} →
            </button>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <ProtoLogo variant="full" size="md" tagline={false} />
        </div>
        <p>Trade access only. Not open to the general public.</p>
        <a
          href="#/"
          onClick={(e) => { e.preventDefault(); window.location.hash = ''; }}
          style={{
            color: '#94a3b8',
            fontWeight: 700,
            fontSize: 13,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ArrowLeft size={14} />
          Back to home
        </a>
      </footer>
    </div>
  );
}
