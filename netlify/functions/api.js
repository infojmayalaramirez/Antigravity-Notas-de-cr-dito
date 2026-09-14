const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const store = getStore('casa-ayala-db');

    if (event.httpMethod === 'POST' || event.httpMethod === 'PUT') {
      const payload = JSON.parse(event.body || '{}');
      const storeData = payload.data || payload;

      let existing = await store.getJSON('ayala_global_store');
      if (!existing || typeof existing !== 'object') {
        existing = {
          clientes: [],
          operadores: [],
          vendedores: [],
          proveedores: [],
          presupuestos: [],
          notas: [],
          faltantesPicking: []
        };
      }

      function mergeArray(target, source) {
        const map = new Map();
        (target || []).forEach(item => { if (item && item.id) map.set(String(item.id), item); });
        (source || []).forEach(item => { if (item && item.id) map.set(String(item.id), item); });
        return Array.from(map.values());
      }

      const mergedStore = {
        clientes: mergeArray(existing.clientes, storeData.clientes),
        operadores: mergeArray(existing.operadores, storeData.operadores),
        vendedores: mergeArray(existing.vendedores, storeData.vendedores),
        proveedores: mergeArray(existing.proveedores, storeData.proveedores),
        presupuestos: mergeArray(existing.presupuestos, storeData.presupuestos),
        notas: mergeArray(existing.notas, storeData.notas),
        faltantesPicking: mergeArray(existing.faltantesPicking, storeData.faltantesPicking)
      };

      await store.setJSON('ayala_global_store', mergedStore);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: mergedStore })
      };
    } else {
      let data = await store.getJSON('ayala_global_store');
      if (!data) {
        data = {
          clientes: [],
          operadores: [],
          vendedores: [],
          proveedores: [],
          presupuestos: [],
          notas: [],
          faltantesPicking: []
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: data })
      };
    }
  } catch (err) {
    console.warn('[Netlify Native DB] Error context:', err.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message,
        data: { clientes: [], operadores: [], vendedores: [], proveedores: [], presupuestos: [], notas: [], faltantesPicking: [] }
      })
    };
  }
};
