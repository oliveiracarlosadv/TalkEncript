// Endereço por extenso a partir das coordenadas (geocodificação reversa).
// Somente a latitude e a longitude são enviadas aos serviços do OpenStreetMap;
// nenhum arquivo da conversa sai do computador.

export const SOURCES = {
  nominatim: 'https://nominatim.openstreetmap.org/reverse',
  photon: 'https://photon.komoot.io/reverse',
  overpass: 'https://overpass-api.de/api/interpreter',
};

export const ATTRIBUTION = 'Dados de endereço: © colaboradores do OpenStreetMap, disponíveis sob a licença ODbL (openstreetmap.org/copyright).';

const UF = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO',
  Roraima: 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

// Tipos de logradouro (por extenso) e abreviações usuais.
const STREET_TYPES = [
  ['Avenida', ['av', 'av.', 'avenida']], ['Rua', ['r', 'r.', 'rua']], ['Travessa', ['tv', 'tv.', 'trav', 'trav.', 'travessa']],
  ['Passagem', ['psg', 'psg.', 'pass.', 'passagem']], ['Alameda', ['al', 'al.', 'alameda']], ['Rodovia', ['rod', 'rod.', 'rodovia']],
  ['Estrada', ['est', 'est.', 'estr', 'estr.', 'estrada']], ['Praça', ['pç', 'pç.', 'pca', 'pça', 'pça.', 'praça', 'praca']],
  ['Largo', ['lg', 'lg.', 'largo']], ['Vila', ['vl', 'vl.', 'vila']], ['Beco', ['bc', 'bc.', 'beco']], ['Viela', ['viela']],
  ['Ladeira', ['ld', 'ld.', 'ladeira']], ['Via', ['via']], ['Conjunto', ['cj', 'cj.', 'conj', 'conj.', 'conjunto']],
  ['Quadra', ['qd', 'qd.', 'quadra']], ['Servidão', ['servidão', 'servidao']], ['Caminho', ['caminho']],
  ['Marginal', ['marginal']], ['Viaduto', ['viaduto']], ['Ponte', ['ponte']], ['Parque', ['parque']],
  ['Boulevard', ['boulevard', 'bulevar']], ['Calçadão', ['calçadão', 'calcadao']], ['Acesso', ['acesso']],
];

/** Separa o tipo de logradouro do nome: "Av. Presidente Vargas" vira Avenida e Presidente Vargas. */
export function splitStreetType(road) {
  const text = String(road ?? '').trim();
  if (!text) return { tipo: null, nome: null };
  const [first, ...rest] = text.split(/\s+/);
  const key = first.toLowerCase();
  const found = STREET_TYPES.find(([, aliases]) => aliases.includes(key));
  if (!found || !rest.length) return { tipo: null, nome: text };
  return { tipo: found[0], nome: rest.join(' ') };
}

export function stateWithUF(state, iso) {
  if (!state) return null;
  const uf = (iso && /^BR-([A-Z]{2})$/.exec(iso)?.[1]) || UF[state];
  return uf ? `${state} (${uf})` : state;
}

const formatCEP = (cep) => {
  const d = String(cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (cep || null);
};

export function parseNominatim(json) {
  const a = json?.address;
  if (!a) return null;
  const { tipo, nome } = splitStreetType(a.road ?? a.pedestrian ?? a.footway ?? a.path ?? a.residential);
  return {
    tipoLogradouro: tipo,
    logradouro: nome,
    numero: a.house_number ?? null,
    bairro: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.hamlet ?? null,
    cidade: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null,
    estado: stateWithUF(a.state, a['ISO3166-2-lvl4']),
    cep: formatCEP(a.postcode),
    pais: a.country ?? null,
    enderecoCompleto: json.display_name ?? null,
    fonte: 'Nominatim (OpenStreetMap)',
  };
}

export function parsePhoton(json) {
  const p = json?.features?.[0]?.properties;
  if (!p) return null;
  const { tipo, nome } = splitStreetType(p.street ?? (p.type === 'street' ? p.name : null));
  return {
    tipoLogradouro: tipo,
    logradouro: nome,
    numero: p.housenumber ?? null,
    bairro: p.district ?? p.locality ?? null,
    cidade: p.city ?? p.county ?? null,
    estado: stateWithUF(p.state),
    cep: formatCEP(p.postcode),
    pais: p.country ?? null,
    enderecoCompleto: [p.street, p.housenumber, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean).join(', ') || null,
    fonte: 'Photon (OpenStreetMap)',
  };
}

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Números de imóveis cadastrados no OpenStreetMap ao redor do ponto, do mais próximo ao mais distante. */
export function parseOverpass(json, lat, lon, limit = 10) {
  const seen = new Set();
  return (json?.elements ?? [])
    .map((e) => {
      const t = e.tags ?? {};
      const la = e.lat ?? e.center?.lat;
      const lo = e.lon ?? e.center?.lon;
      if (!t['addr:housenumber'] || la == null) return null;
      return { numero: t['addr:housenumber'], logradouro: t['addr:street'] ?? null, distancia: Math.round(distanceMeters(lat, lon, la, lo)) };
    })
    .filter(Boolean)
    .sort((a, b) => a.distancia - b.distancia)
    .filter((n) => { const k = `${n.logradouro}|${n.numero}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
}

export const searchRadius = (accuracy) => Math.round(Math.min(Math.max(Number(accuracy) || 50, 30), 150));

async function getJSON(fetchFn, url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta o endereço por extenso e os números próximos.
 * Devolve { ...endereço, raio, numerosProximos, consultadoEm } ou { motivo } em caso de falha.
 */
export async function lookupAddress(lat, lon, accuracy, { fetchFn = fetch, timeoutMs = 12000 } = {}) {
  const consultadoEm = new Date().toISOString();
  const raio = searchRadius(accuracy);
  let address = null;
  const errors = [];
  try {
    const url = `${SOURCES.nominatim}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    address = parseNominatim(await getJSON(fetchFn, url, { headers: { Accept: 'application/json' } }, timeoutMs));
  } catch (e) { errors.push(`Nominatim: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`); }
  if (!address) {
    try {
      address = parsePhoton(await getJSON(fetchFn, `${SOURCES.photon}?lat=${lat}&lon=${lon}&lang=default`, {}, timeoutMs));
    } catch (e) { errors.push(`Photon: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`); }
  }
  if (!address) return { motivo: errors.length ? `serviço de endereços indisponível ou sem conexão com a internet (${errors.join('; ')})` : 'endereço não encontrado para estas coordenadas', consultadoEm };

  let numerosProximos = [];
  let numerosMotivo = null;
  try {
    const query = `[out:json][timeout:10];(node(around:${raio},${lat},${lon})["addr:housenumber"];way(around:${raio},${lat},${lon})["addr:housenumber"];);out tags center 40;`;
    const json = await getJSON(fetchFn, SOURCES.overpass, { method: 'POST', body: new URLSearchParams({ data: query }) }, timeoutMs);
    numerosProximos = parseOverpass(json, lat, lon);
    if (!numerosProximos.length) numerosMotivo = `nenhum número de imóvel cadastrado no OpenStreetMap em um raio de ${raio} metros`;
  } catch (e) {
    numerosMotivo = `consulta indisponível (${e.name === 'AbortError' ? 'tempo esgotado' : e.message})`;
  }
  return { ...address, raio, numerosProximos, numerosMotivo, consultadoEm, atribuicao: ATTRIBUTION };
}
