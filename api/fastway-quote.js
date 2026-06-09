const FASTWAY_BASE = 'https://api.fastway.org/v2';
const ORIGIN_POSTCODE = process.env.FASTWAY_ORIGIN_POSTCODE || '8001';
const ORIGIN_SUBURB = process.env.FASTWAY_ORIGIN_SUBURB || 'Cape Town';
const COUNTRY_CODE_SOUTH_AFRICA = '24';

function clean(value = '') {
  return String(value || '').trim();
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function normalize(value = '') {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function localityFromInput(value = '') {
  const compact = clean(value).replace(/\b\d{4}\b/g, '').trim();
  const streetMatch = compact.match(/\b(?:street|st|road|rd|avenue|ave|drive|dr|close|crescent|cres|lane|ln|way|boulevard|blvd|court|ct|place|pl|circle|cir|terrace|ter)\b\s+(.+)$/i);
  if (streetMatch?.[1]) return clean(streetMatch[1]);
  const commaParts = compact.split(',').map((part) => clean(part)).filter(Boolean);
  if (commaParts.length >= 2) return commaParts[commaParts.length - 1];
  const words = compact.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && /^\d/.test(words[0])) return words.slice(-2).join(' ');
  return compact;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error || data?.message || text || `Fastway request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function buildUrl(path, params) {
  const url = new URL(`${FASTWAY_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function resolveDeliveryLocation({ apiKey, pickupRf, suburbInput, postcode }) {
  const postcodeMatches = await fetchJson(buildUrl(`/psc/listdeliverysuburbs/${encodeURIComponent(pickupRf)}/${encodeURIComponent(postcode)}`, {
    api_key: apiKey,
  }));
  const postcodeOptions = Array.isArray(postcodeMatches?.result) ? postcodeMatches.result : [];
  const normalizedInput = normalize(suburbInput);

  const postcodeMatch = postcodeOptions.find((item) => normalizedInput.includes(normalize(item.Town)) || normalize(item.Town).includes(normalizedInput));
  if (postcodeMatch) {
    return {
      suburb: clean(postcodeMatch.Town),
      postcode: clean(postcodeMatch.Postcode) || postcode,
      suggestions: postcodeOptions,
    };
  }

  const locality = localityFromInput(suburbInput);
  const termMatches = await fetchJson(buildUrl('/psc/listdeliverysuburbs', {
    api_key: apiKey,
    RFCode: pickupRf,
    term: locality,
  }));
  const termOptions = Array.isArray(termMatches?.result) ? termMatches.result : [];
  const exactTownMatches = termOptions.filter((item) => normalize(item.Town) === normalize(locality));

  if (exactTownMatches.length === 1) {
    return {
      suburb: clean(exactTownMatches[0].Town),
      postcode: clean(exactTownMatches[0].Postcode) || postcode,
      suggestions: exactTownMatches,
    };
  }

  if (exactTownMatches.length > 1) {
    const samePostcode = exactTownMatches.find((item) => clean(item.Postcode) === postcode);
    if (samePostcode) {
      return { suburb: clean(samePostcode.Town), postcode, suggestions: exactTownMatches };
    }
    const optionsText = exactTownMatches.slice(0, 5).map((item) => `${clean(item.Town)} ${clean(item.Postcode)}`).join(', ');
    throw new Error(`Fastway found ${clean(locality)} but not with postcode ${postcode}. Try one of these postcode options: ${optionsText}.`);
  }

  if (postcodeOptions.length) {
    const optionsText = postcodeOptions.slice(0, 6).map((item) => clean(item.Town)).join(', ');
    throw new Error(`Fastway could not match "${clean(suburbInput)}" to postcode ${postcode}. Try the suburb only, for example: ${optionsText}.`);
  }

  return { suburb: clean(locality || suburbInput), postcode, suggestions: [] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.FASTWAY_API_KEY || 'a5ba996d4b5ce8578ebcfa5aff1be6c0';
  const customerId = process.env.FASTWAY_CUSTOMER_ID || '239686';
  const userId = process.env.FASTWAY_USER_ID || '19256';
  if (!apiKey) return res.status(500).json({ error: 'Fastway API key not configured' });

  const suburb = clean(req.body?.suburb);
  const postcode = clean(req.body?.postcode);
  const weightKg = asNumber(req.body?.weightKg);

  if (!suburb || !postcode || !Number.isFinite(weightKg) || weightKg <= 0) {
    return res.status(400).json({ error: 'suburb, postcode and weightKg are required' });
  }

  try {
    const pickup = await fetchJson(buildUrl(`/psc/pickuprf/${encodeURIComponent(ORIGIN_POSTCODE)}/${COUNTRY_CODE_SOUTH_AFRICA}`, {
      api_key: apiKey,
      Suburb: ORIGIN_SUBURB,
    }));
    const pickupRf = pickup?.result?.franchise_code;
    if (!pickupRf) throw new Error('Could not resolve Fastway pickup franchise');

    const resolvedLocation = await resolveDeliveryLocation({
      apiKey,
      pickupRf,
      suburbInput: suburb,
      postcode,
    });

    const quotePayload = await fetchJson(buildUrl('/psc/lookup', {
      api_key: apiKey,
      RFCode: pickupRf,
      Suburb: resolvedLocation.suburb,
      DestPostcode: resolvedLocation.postcode,
      WeightInKg: weightKg,
    }));

    const result = quotePayload?.result || {};
    const services = Array.isArray(result.services) ? result.services : [];
    const bestService = services
      .filter((service) => Number(service?.totalprice_normal) > 0)
      .sort((a, b) => Number(a.totalprice_normal) - Number(b.totalprice_normal))[0];

    if (!bestService) {
      return res.status(422).json({ error: 'Fastway did not return a usable courier service for that destination.' });
    }

    return res.status(200).json({
      quote: {
        serviceName: clean(bestService.name, 'Courier service'),
        totalPrice: Number(bestService.totalprice_normal || 0),
        totalPriceExVat: Number(bestService.totalprice_normal_exgst || 0),
        currencySymbol: clean(result.currency_symbol, 'R'),
        deliveryDays: clean(result.delivery_timeframe_days, ''),
        to: clean(result.to, resolvedLocation.suburb || suburb),
        postcode: clean(result.postcode, resolvedLocation.postcode || postcode),
        isRural: Boolean(result.isRural),
        weightKg: Number(result.parcel_weight_kg || weightKg),
        pickupFranchise: clean(result.pickfranchise_code || pickupRf),
        deliveryFranchise: clean(result.delfranchise_code, ''),
      },
      meta: {
        pickupSuburb: ORIGIN_SUBURB,
        pickupPostcode: ORIGIN_POSTCODE,
        customerId,
        userId,
      },
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Fastway quote failed' });
  }
}
