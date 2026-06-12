import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SKU_RE = /^[A-Z0-9][A-Z0-9-]{0,63}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = getAdminClient();
  const body = req.body || {};
  const { action } = body;

  try {
    if (action === 'log') {
      const {
        searchTerm,
        resultsFound,
        sessionId,
        customerId = null,
        customerEmail = null,
        filtersApplied = [],
        refinementOfSearchId = null,
        normalizedSearchTerm,
      } = body;

      const term = String(searchTerm || '').trim().slice(0, 200);
      const sid = String(sessionId || '').trim();
      if (!term || !sid) return res.status(400).json({ error: 'searchTerm and sessionId required' });

      const { data, error } = await supabase
        .from('search_analytics')
        .insert({
          search_term: term,
          normalized_search_term: String(normalizedSearchTerm || term).slice(0, 200),
          results_found: Math.max(0, Number(resultsFound) || 0),
          session_id: sid,
          customer_id: customerId || null,
          customer_email: customerEmail ? String(customerEmail).slice(0, 320) : null,
          search_filter_applied: Array.isArray(filtersApplied) && filtersApplied.length ? filtersApplied : null,
          refinement_of_search_id: refinementOfSearchId || null,
        })
        .select('id, created_at')
        .single();

      if (error) {
        if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
        throw error;
      }
      return res.status(200).json({ ok: true, id: data.id, created_at: data.created_at });
    }

    if (action === 'click') {
      const { searchRowId, clickedSku, position, timeToClickMs } = body;
      if (!searchRowId) return res.status(200).json({ ok: true });
      const sku = String(clickedSku || '').trim();
      if (sku && !SKU_RE.test(sku)) return res.status(400).json({ error: 'Invalid SKU' });

      const { error } = await supabase
        .from('search_analytics')
        .update({
          clicked_product_sku: sku || null,
          search_position_clicked: position != null ? Math.max(1, Number(position) || 1) : null,
          time_to_click_ms: timeToClickMs != null ? Math.max(0, Number(timeToClickMs) || 0) : null,
        })
        .eq('id', searchRowId);

      if (error && error.code !== '42P01') throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'cart') {
      const { searchRowId } = body;
      if (!searchRowId) return res.status(200).json({ ok: true });
      const { error } = await supabase
        .from('search_analytics')
        .update({ added_to_cart: true })
        .eq('id', searchRowId);
      if (error && error.code !== '42P01') throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'order') {
      const { searchRowId, orderNumber, orderValue } = body;
      if (!searchRowId) return res.status(200).json({ ok: true });
      const { error } = await supabase
        .from('search_analytics')
        .update({
          order_created: true,
          order_number: orderNumber ? String(orderNumber).slice(0, 80) : null,
          order_value: orderValue != null ? Number(orderValue) : null,
        })
        .eq('id', searchRowId);
      if (error && error.code !== '42P01') throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('search-analytics api error:', err?.message || err);
    return res.status(500).json({ error: 'Search analytics failed' });
  }
}
