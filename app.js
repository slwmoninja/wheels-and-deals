const DEFAULT_QUERY = {
  make: 'Jeep',
  model: 'Wrangler',
  trim: '',
  maxMileage: 80000,
  maxPrice: 40000,
  zip: '23185',
  hours: 2,
};

const els = {
  form: document.getElementById('searchForm'),
  make: document.getElementById('fMake'),
  model: document.getElementById('fModel'),
  trim: document.getElementById('fTrim'),
  mileage: document.getElementById('fMileage'),
  budget: document.getElementById('fBudget'),
  zip: document.getElementById('fZip'),
  hours: document.getElementById('fHours'),
  statusBanner: document.getElementById('statusBanner'),
  resultsSection: document.getElementById('resultsSection'),
  resultsMeta: document.getElementById('resultsMeta'),
  resultsBody: document.getElementById('resultsBody'),
  resultsNote: document.getElementById('resultsNote'),
  resultsTable: document.getElementById('resultsTable'),
  noSnapshotSection: document.getElementById('noSnapshotSection'),
  promptBox: document.getElementById('promptBox'),
  copyPromptBtn: document.getElementById('copyPromptBtn'),
  inspectionSection: document.getElementById('inspectionSection'),
  inspectionBody: document.getElementById('inspectionBody'),
  inspectionLabel: document.getElementById('inspectionLabel'),
  weightSummary: document.getElementById('weightSummary'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  infoModal: document.getElementById('infoModal'),
  infoCloseBtn: document.getElementById('infoCloseBtn'),
  inspectionCloseBtn: document.getElementById('inspectionCloseBtn'),
  settingsModal: document.getElementById('settingsModal'),
  settingsToggleBtn: document.getElementById('settingsToggleBtn'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  aboutBtn: document.getElementById('aboutBtn'),
};

let currentListings = [];
let snapshotListings = [];
let lastQuery = null;
let currentSort = 'delta';
let sortDir = 1; // 1 = best value first

const WEIGHT_LABELS = { miles: 'Miles', price: 'Price', distanceMi: 'Distance', delta: 'Value' };
const columnWeights = { miles: 0, price: 0, distanceMi: 0, delta: 0 };
const weightInputs = [...document.querySelectorAll('.col-weight')];

function totalWeight() {
  return Object.values(columnWeights).reduce((a, b) => a + b, 0);
}

function updateWeightSummary() {
  const active = Object.entries(columnWeights).filter(([, w]) => w > 0);
  if (!active.length) {
    els.weightSummary.style.display = 'none';
    return;
  }
  const parts = active.map(([k, w]) => `<strong>${WEIGHT_LABELS[k]}</strong> ×${w}`).join(', ');
  els.weightSummary.innerHTML = `<span>Ranked by your priorities: ${parts}</span><button type="button" id="clearWeightsBtn">Clear weights</button>`;
  els.weightSummary.style.display = 'flex';
  document.getElementById('clearWeightsBtn').addEventListener('click', () => {
    weightInputs.forEach((inp) => { inp.value = 0; inp.classList.remove('weighted'); });
    Object.keys(columnWeights).forEach((k) => { columnWeights[k] = 0; });
    updateWeightSummary();
    renderTable(currentListings);
  });
}

weightInputs.forEach((input) => {
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    const key = input.dataset.weight;
    const val = Math.max(0, Math.min(5, Number(input.value) || 0));
    input.value = val;
    columnWeights[key] = val;
    input.classList.toggle('weighted', val > 0);
    updateWeightSummary();
    renderTable(currentListings);
  });
});

const searchFields = [...document.querySelectorAll('.field input, .field select')];
function updateFilledState(field) {
  field.classList.toggle('filled', field.value.trim() !== '');
}
searchFields.forEach((field) => {
  updateFilledState(field);
  field.addEventListener('input', () => updateFilledState(field));
});

function closeModals() {
  els.modalBackdrop.style.display = 'none';
  els.infoModal.style.display = 'none';
  els.inspectionSection.style.display = 'none';
  els.settingsModal.style.display = 'none';
}
function openModal(panel) {
  els.modalBackdrop.style.display = 'block';
  panel.style.display = 'block';
}
els.infoCloseBtn.addEventListener('click', closeModals);
els.inspectionCloseBtn.addEventListener('click', closeModals);
els.settingsToggleBtn.addEventListener('click', () => openModal(els.settingsModal));
els.settingsCloseBtn.addEventListener('click', closeModals);
els.aboutBtn.addEventListener('click', () => {
  closeModals();
  openModal(els.infoModal);
});
els.modalBackdrop.addEventListener('click', closeModals);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

const FAVORITES_KEY = 'wad_favorites';
function listingId(l) {
  return `${l.year}|${l.trim}|${l.city}|${l.price}`;
}
function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
let favorites = loadFavorites();
function saveFavorites() {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
}
function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  saveFavorites();
  renderTable(currentListings);
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

els.resultsTable.querySelectorAll('th.sortable').forEach((th) => {
  th.addEventListener('click', (e) => {
    if (e.target.closest('.col-weight')) return;
    const key = th.dataset.sort;
    if (currentSort === key) {
      sortDir *= -1;
    } else {
      currentSort = key;
      sortDir = 1;
    }
    els.resultsTable.querySelectorAll('th.sortable').forEach((h) => h.classList.remove('active'));
    th.classList.add('active');
    renderTable(currentListings);
  });
});

els.copyPromptBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.promptBox.value);
    els.copyPromptBtn.textContent = '✅ Copied';
    setTimeout(() => { els.copyPromptBtn.textContent = '📋 Copy prompt'; }, 1500);
  } catch {
    els.promptBox.select();
  }
});

function slugify(s) {
  return String(s || '').trim().toLowerCase();
}

async function loadSnapshotIndex() {
  const res = await fetch(`data/snapshots-index.json?v=${Date.now()}`);
  if (!res.ok) throw new Error('Could not load snapshot index');
  return res.json();
}

function findSnapshotEntry(index, query) {
  return index.snapshots.find(
    (s) => s.make === slugify(query.make) && s.model === slugify(query.model) && s.zip === query.zip
  );
}

async function loadSnapshot(file) {
  const res = await fetch(`data/${file}?v=${Date.now()}`);
  if (!res.ok) throw new Error('Could not load snapshot data');
  return res.json();
}

function kbbDeltaMid(listing) {
  return (listing.kbbDeltaLow + listing.kbbDeltaHigh) / 2;
}

const DELTA_RATING_TIERS = [
  { max: -2000, label: 'Great Deal', cls: 'rating-great' },
  { max: -500, label: 'Good Deal', cls: 'rating-good' },
  { max: 1500, label: 'Fair Deal', cls: 'rating-fair' },
  { max: 3500, label: 'Above Market', cls: 'rating-above' },
  { max: Infinity, label: 'Overpriced', cls: 'rating-over' },
];

function ratingForDelta(mid) {
  return DELTA_RATING_TIERS.find((tier) => mid <= tier.max);
}

function deltaClass(mid) {
  if (mid < -250) return 'delta-under';
  if (mid > 250) return 'delta-over';
  return 'delta-at';
}

function formatDelta(listing) {
  const { kbbDeltaLow: lo, kbbDeltaHigh: hi, kbbNote } = listing;
  const fmt = (n) => `$${Math.abs(n).toLocaleString()}`;
  let range;
  if (lo === 0 && hi === 0) {
    range = '~at book';
  } else if (lo === hi) {
    range = `~${fmt(lo)} ${lo < 0 ? 'under' : 'over'}`;
  } else {
    range = `~${fmt(lo)}–${fmt(hi)} ${hi < 0 ? 'under' : 'over'}`;
  }
  return kbbNote ? `${range} (${kbbNote})` : range;
}

function applyFilters(listings, query) {
  return listings.filter((l) => {
    if (l.miles > query.maxMileage) return false;
    if (l.price > query.maxPrice) return false;
    const driveHours = l.distanceMi / 55; // rough highway-speed estimate
    if (driveHours > query.hours + 0.15) return false;
    if (query.trim && !l.trim.toLowerCase().includes(query.trim.toLowerCase())) return false;
    return true;
  });
}

const WRANGLER_GENERATION_PHOTOS = {
  TJ: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/1996-2006_Jeep_Wrangler_TJ.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:1996-2006_Jeep_Wrangler_TJ.jpg',
    credit: 'Carluver23, CC0',
  },
  JK: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Jeep_Wrangler_JK_-_001.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Jeep_Wrangler_JK_-_001.jpg',
    credit: 'JamesHenry, CC BY 2.0',
  },
  JL: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Jeep_Wrangler_Unlimited_JL_black_(1).jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Jeep_Wrangler_Unlimited_JL_black_(1).jpg',
    credit: 'Damian B Oh, CC BY-SA 4.0',
  },
};

function photoForListing(query, listing) {
  if (listing.photoUrl) return { url: listing.photoUrl, real: true };
  if (slugify(query.make) !== 'jeep' || slugify(query.model) !== 'wrangler') return null;
  const gen = listing.year <= 2006 ? 'TJ' : listing.year <= 2017 ? 'JK' : 'JL';
  return { ...WRANGLER_GENERATION_PHOTOS[gen], real: false };
}

function listingUrl(listing, query) {
  if (listing.listingUrl) return listing.listingUrl;
  const params = new URLSearchParams({
    'makes[]': slugify(query.make),
    zip: query.zip,
    maximum_distance: 'all',
    stock_type: 'used',
    list_price_max: String(query.maxPrice),
    mileage_max: String(query.maxMileage),
    year_min: String(listing.year),
    year_max: String(listing.year),
  });
  return `https://www.cars.com/shopping/results/?${params.toString()}`;
}

const WEIGHT_METRICS = {
  miles: (l) => l.miles,
  price: (l) => l.price,
  distanceMi: (l) => l.distanceMi,
  delta: (l) => kbbDeltaMid(l),
};

function weightedScoreFn(listings) {
  const ranges = {};
  Object.keys(WEIGHT_METRICS).forEach((key) => {
    if (!columnWeights[key]) return;
    const vals = listings.map(WEIGHT_METRICS[key]);
    ranges[key] = { min: Math.min(...vals), max: Math.max(...vals) };
  });
  return (l) => {
    let score = 0;
    Object.keys(WEIGHT_METRICS).forEach((key) => {
      const w = columnWeights[key];
      if (!w) return;
      const { min, max } = ranges[key];
      const norm = max === min ? 0 : (WEIGHT_METRICS[key](l) - min) / (max - min);
      score += w * norm; // lower is always better across all four metrics
    });
    return score;
  };
}

function sortListings(listings) {
  let sorted;
  if (totalWeight() > 0) {
    const scoreFn = weightedScoreFn(listings);
    sorted = [...listings].sort((a, b) => scoreFn(a) - scoreFn(b));
  } else {
    sorted = [...listings];
    sorted.sort((a, b) => {
      let av, bv;
      switch (currentSort) {
        case 'vehicle': av = `${a.year} ${a.trim}`; bv = `${b.year} ${b.trim}`; return sortDir * av.localeCompare(bv);
        case 'miles': av = a.miles; bv = b.miles; break;
        case 'price': av = a.price; bv = b.price; break;
        case 'delta':
        default: av = kbbDeltaMid(a); bv = kbbDeltaMid(b); break;
      }
      return sortDir * (av - bv);
    });
  }
  const favs = sorted.filter((l) => favorites.has(listingId(l)));
  const rest = sorted.filter((l) => !favorites.has(listingId(l)));
  return [...favs, ...rest];
}

function renderTable(listings) {
  const sorted = sortListings(listings);
  els.resultsBody.innerHTML = sorted.map((l, i) => {
    const mid = kbbDeltaMid(l);
    const rating = ratingForDelta(mid);
    const id = listingId(l);
    const isFav = favorites.has(id);
    const photo = lastQuery ? photoForListing(lastQuery, l) : null;
    const url = lastQuery ? listingUrl(l, lastQuery) : '#';
    const linkLabel = l.listingUrl ? 'View Listing ↗' : 'Search ↗';
    const photoCell = photo
      ? `<a href="${url}" target="_blank" rel="noopener"><img class="photo-thumb" src="${photo.url}" alt="${photo.real ? 'Listing photo' : 'Representative photo'}" loading="lazy"></a>` +
        (photo.real ? '' : `<a class="photo-credit" href="${photo.sourceUrl}" target="_blank" rel="noopener">${photo.credit}</a>`)
      : `<span class="photo-placeholder">No photo</span>`;
    return `
      <tr>
        <td class="col-fav"><button type="button" class="fav-btn${isFav ? ' active' : ''}" data-id="${id}" aria-label="${isFav ? 'Remove favorite' : 'Add favorite'}">${isFav ? '★' : '☆'}</button></td>
        <td class="col-rank">${i + 1}</td>
        <td class="col-photo">${photoCell}</td>
        <td class="col-vehicle">
          <div class="veh-title">${l.year} ${l.trim}</div>
        </td>
        <td class="col-miles">${l.miles.toLocaleString()}</td>
        <td class="col-price">$${l.price.toLocaleString()}</td>
        <td class="col-location">${l.city}${l.distanceMi ? ` (${l.distanceMi} mi)` : ''}</td>
        <td class="col-delta ${deltaClass(mid)}">${formatDelta(l)}</td>
        <td class="col-rating"><span class="rating-pill ${rating.cls}">${rating.label}</span></td>
        <td class="col-inspect"><button type="button" class="row-inspect-btn" data-id="${id}" aria-label="Inspection shops near ${l.city}" title="Inspection shops near this listing">🔧</button></td>
        <td class="col-link"><a href="${url}" target="_blank" rel="noopener" class="btn-secondary" style="display:inline-block;padding:0.3rem 0.6rem;font-size:0.72rem;">${linkLabel}</a></td>
      </tr>`;
  }).join('');
}

els.resultsBody.addEventListener('click', (e) => {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    toggleFavorite(favBtn.dataset.id);
    return;
  }
  const inspectBtn = e.target.closest('.row-inspect-btn');
  if (inspectBtn) {
    const listing = currentListings.find((l) => listingId(l) === inspectBtn.dataset.id);
    if (listing) openInspectionForListing(listing);
  }
});

function inspectionEstimate(listing) {
  const trim = listing.trim.toLowerCase();
  const isElectrified = trim.includes('4xe') || trim.includes('hybrid') || trim.includes('ev');
  const isOld = listing.year <= 2010;
  const costLow = isElectrified ? 175 : isOld ? 90 : 100;
  const costHigh = isElectrified ? 275 : isOld ? 160 : 200;
  return { costLow, costHigh, electrified: isElectrified };
}

function baseCityOf(city) {
  const shipsTo = city.match(/ships to ([^)]+)/i);
  if (shipsTo) return shipsTo[1].trim();
  return city.replace(/^CarMax\s+/i, '').trim();
}

function shopsNearListing(listing) {
  const targetCity = baseCityOf(listing.city).toLowerCase();
  const seen = new Map();
  snapshotListings.forEach((l) => {
    if (!l.inspection || seen.has(l.inspection.business)) return;
    const shopCity = baseCityOf(l.city).toLowerCase();
    const serviceArea = (l.inspection.serviceArea || '').toLowerCase();
    const exact = shopCity === targetCity;
    if (exact || serviceArea.includes(targetCity)) {
      seen.set(l.inspection.business, { ...l.inspection, exact });
    }
  });
  return [...seen.values()].sort((a, b) => Number(b.exact) - Number(a.exact));
}

function inspectionShopRowHtml(shop) {
  const priceText = shop.priceLow != null ? `$${shop.priceLow}–$${shop.priceHigh}` : 'call for quote';
  const nameHtml = shop.sourceUrl ? `<a href="${shop.sourceUrl}" target="_blank" rel="noopener">${shop.business}</a>` : shop.business;
  const coverage = shop.exact && shop.address
    ? shop.address
    : `serves ${shop.serviceArea || 'this area'}`;
  return `
    <tr>
      <td class="col-vehicle"><strong>${nameHtml}</strong></td>
      <td class="col-location">${coverage} · ${shop.phone}</td>
      <td class="col-price">${priceText}</td>
    </tr>`;
}

function openInspectionForListing(listing) {
  const shops = shopsNearListing(listing);
  els.inspectionLabel.textContent = `🔧 Inspection shops — ${listing.year} ${listing.trim} (${listing.city})`;
  if (shops.length) {
    els.inspectionBody.innerHTML = shops.map(inspectionShopRowHtml).join('');
  } else {
    const est = inspectionEstimate(listing);
    const note = est.electrified
      ? 'look for a shop that services hybrid/4xe drivetrains, not just standard ICE PPIs'
      : 'any certified independent mechanic or mobile PPI service can cover this';
    els.inspectionBody.innerHTML = `
      <tr>
        <td colspan="3">No researched shop covers this area yet — search "pre-purchase inspection" near ${listing.city} (${note}). Typical cost: ~$${est.costLow}–$${est.costHigh} (not a quote).</td>
      </tr>`;
  }
  openModal(els.inspectionSection);
}

function currentQuery() {
  return {
    make: els.make.value,
    model: els.model.value,
    trim: els.trim.value,
    maxMileage: Number(els.mileage.value) || 0,
    maxPrice: Number(els.budget.value) || 0,
    zip: els.zip.value,
    hours: Number(els.hours.value),
  };
}

function buildPrompt(query) {
  return `Using WebFetch/WebSearch (not a scripted HTTP request — Cars.com, KBB, and similar sites block plain curl/requests-style scraping with a 403/Akamai block, but Claude's WebFetch tool gets through), search current used-vehicle listings for a ${query.make} ${query.trim ? query.trim + ' ' : ''}${query.model}, under ${query.maxMileage.toLocaleString()} miles, under $${query.maxPrice.toLocaleString()}, within a ${query.hours}-hour drive of ZIP ${query.zip}. For each result: (1) WebSearch a KBB Fair Purchase Price anchor for that model year/trim and estimate the delta vs. asking price; (2) fetch that specific vehicle's own listing detail page (VDP) — not just the search-results page — confirm the price and mileage shown on it match, and save that URL in a "listingUrl" field; only omit "listingUrl" if you genuinely cannot locate that specific vehicle's own page (never substitute a generic search-results link in its place); (3) from that same VDP, grab the direct URL of that vehicle's own primary photo (verify it's a real photo of that vehicle, not a placeholder or dealer logo, before trusting it) and save it in a "photoUrl" field; only omit "photoUrl" if no real photo could be found. For the top 5 best-value results, also WebFetch/WebSearch a real, named pre-purchase-inspection shop (independent mechanic or mobile PPI service) actually serving that listing's city — with phone/address and published price if the shop lists one — rather than generic advice; don't invent a business that isn't real. Sort results by best value first (most under book). Save the results as JSON matching the schema in data/jeep-wrangler-23185.json, write it to data/${slugify(query.make)}-${slugify(query.model)}-${query.zip}.json, and add an entry to data/snapshots-index.json.`;
}

async function runSearch() {
  const query = currentQuery();
  els.statusBanner.style.display = 'none';
  els.resultsSection.style.display = 'none';
  els.noSnapshotSection.style.display = 'none';
  closeModals();

  let index;
  try {
    index = await loadSnapshotIndex();
  } catch (err) {
    showStatus('Could not load search data. Try again in a moment.');
    return;
  }

  const entry = findSnapshotEntry(index, query);
  if (!entry) {
    els.promptBox.value = buildPrompt(query);
    els.noSnapshotSection.style.display = 'block';
    return;
  }

  let snapshot;
  try {
    snapshot = await loadSnapshot(entry.file);
  } catch (err) {
    showStatus('Could not load saved results for this search.');
    return;
  }

  const filtered = applyFilters(snapshot.listings, query);
  currentListings = filtered;
  snapshotListings = snapshot.listings;
  lastQuery = query;

  if (query.maxMileage !== snapshot.query.maxMileage || query.maxPrice !== snapshot.query.maxPrice || query.hours !== snapshot.query.hours) {
    showStatus(`Showing saved results narrowed to your filters (source snapshot covers up to ${snapshot.query.maxMileage.toLocaleString()} mi, $${snapshot.query.maxPrice.toLocaleString()}, ${snapshot.query.hours}hr from ${snapshot.query.zip}).`);
  }

  els.resultsMeta.innerHTML = `<strong>${filtered.length}</strong> result${filtered.length === 1 ? '' : 's'} for <strong>${query.make} ${query.model}</strong>${query.trim ? ` (${query.trim})` : ''} · within ${query.hours}hr of ${query.zip} · compiled ${snapshot.compiledDate}`;
  els.resultsNote.textContent = snapshot.notes || '';
  els.resultsSection.style.display = filtered.length ? 'block' : 'none';

  if (!filtered.length) {
    showStatus('No saved listings match those filters. Try widening mileage, budget, or drive time.');
  } else {
    renderTable(filtered);
  }
}

function showStatus(msg) {
  els.statusBanner.textContent = msg;
  els.statusBanner.style.display = 'block';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

runSearch();
