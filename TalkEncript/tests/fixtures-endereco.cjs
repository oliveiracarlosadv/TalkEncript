// Respostas de exemplo dos serviços do OpenStreetMap, no formato oficial de cada API.
module.exports = {
  nominatim: {
    place_id: 1, lat: '-1.4558330', lon: '-48.5038870',
    display_name: '1500, Avenida Presidente Vargas, Campina, Belém, Região Geográfica Imediata de Belém, Pará, Região Norte, 66017-000, Brasil',
    address: {
      house_number: '1500', road: 'Avenida Presidente Vargas', suburb: 'Campina', city: 'Belém',
      state: 'Pará', 'ISO3166-2-lvl4': 'BR-PA', region: 'Região Norte', postcode: '66017-000', country: 'Brasil', country_code: 'br',
    },
  },
  overpass: {
    elements: [
      { type: 'node', id: 1, lat: -1.45590, lon: -48.50385, tags: { 'addr:housenumber': '1510', 'addr:street': 'Avenida Presidente Vargas' } },
      { type: 'way', id: 2, center: { lat: -1.45575, lon: -48.50392 }, tags: { 'addr:housenumber': '1490', 'addr:street': 'Avenida Presidente Vargas' } },
      { type: 'node', id: 3, lat: -1.45620, lon: -48.50300, tags: { 'addr:housenumber': '82', 'addr:street': 'Travessa Padre Eutíquio' } },
    ],
  },
};
