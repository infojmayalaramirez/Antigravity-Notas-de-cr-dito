/**
 * importar_respaldo.js
 * Lee el archivo respaldo_export.json generado por "Exportar Respaldo"
 * e importa todos los datos a SQL Server.
 * 
 * Uso: node importar_respaldo.js
 */

const sql = require('mssql');
const fs  = require('fs');
const path = require('path');

const dbConfig = {
    user: 'sa', password: 'sql2022', server: 'localhost', database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true }
};

// Buscar el archivo de respaldo
const posibleArchivos = [
    'respaldo_export.json',
    'casa_ayala_respaldo_' + new Date().toISOString().split('T')[0] + '.json'
];
// También buscar cualquier archivo que empiece con casa_ayala_respaldo
const allFiles = fs.readdirSync(__dirname).filter(f => f.startsWith('casa_ayala_respaldo') && f.endsWith('.json'));
const archivos = [...posibleArchivos, ...allFiles];

let archivo = null;
for (const a of archivos) {
    const full = path.join(__dirname, a);
    if (fs.existsSync(full)) { archivo = full; break; }
}

if (!archivo) {
    console.error('\n❌ No se encontró el archivo de respaldo.');
    console.error('   Haga clic en "Exportar Respaldo" en Catálogos y guarde el archivo aquí:\n');
    console.error('   ' + __dirname + '\n');
    process.exit(1);
}

console.log('\n📂 Leyendo:', path.basename(archivo));
const respaldo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const { clientes = [], operadores = [], vendedores = [], proveedores = [], presupuestos = [], notas = [] } = respaldo;

console.log('\n📦 DATOS EN EL RESPALDO:');
console.log('  Clientes:   ', clientes.filter(c => c && c.id && !c.eliminado).length);
console.log('  Operadores: ', operadores.filter(o => o && o.id && !o.eliminado).length);
console.log('  Vendedores: ', vendedores.filter(v => v && v.id && !v.eliminado).length);
console.log('  Proveedores:', proveedores.filter(p => p && p.id && !p.eliminado).length);
console.log('  Notas:      ', notas.filter(n => n && n.id).length);
console.log('');

async function importar() {
    const pool = await sql.connect(dbConfig);
    console.log('✅ Conectado a SQL Server CasaAyalaDB\n');

    let counts = { clientes: 0, operadores: 0, vendedores: 0, proveedores: 0 };

    // ── CLIENTES ─────────────────────────────────────────────────────────────
    for (const c of clientes.filter(c => c && c.id)) {
        try {
            const id     = String(c.id).slice(0, 50);
            const nombre = String(c.nombre || '').slice(0, 255);
            const codigo = String(c.codigoInterno || c.codigo || c.id).slice(0, 50);
            const desc   = (c.tieneDerechoDescuento || c.derechoDescuento) ? 1 : 0;
            const elim   = c.eliminado ? 1 : 0;
            await pool.request()
                .input('id', sql.VarChar, id).input('nombre', sql.VarChar, nombre)
                .input('codigo', sql.VarChar, codigo).input('desc', sql.Bit, desc).input('elim', sql.Bit, elim)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente=@id)
                    INSERT INTO dbo.Clientes (id_cliente,nombre,codigo_interno,tiene_derecho_descuento,eliminado) VALUES (@id,@nombre,@codigo,@desc,@elim)
                    ELSE UPDATE dbo.Clientes SET nombre=@nombre,codigo_interno=@codigo,tiene_derecho_descuento=@desc,eliminado=@elim WHERE id_cliente=@id`);
            if (!c.eliminado) counts.clientes++;
        } catch(e) { console.warn('  ⚠ Cliente:', c.id, e.message); }
    }
    console.log('  ✅ Clientes:   ', counts.clientes);

    // ── OPERADORES ────────────────────────────────────────────────────────────
    for (const o of operadores.filter(o => o && o.id)) {
        try {
            await pool.request()
                .input('id', sql.VarChar, String(o.id).slice(0,50))
                .input('nombre', sql.VarChar, String(o.nombre||'').slice(0,255))
                .input('puesto', sql.VarChar, String(o.puesto||'').slice(0,255))
                .input('elim', sql.Bit, o.eliminado ? 1 : 0)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador=@id)
                    INSERT INTO dbo.Operadores (id_operador,nombre,puesto,eliminado) VALUES (@id,@nombre,@puesto,@elim)
                    ELSE UPDATE dbo.Operadores SET nombre=@nombre,puesto=@puesto,eliminado=@elim WHERE id_operador=@id`);
            if (!o.eliminado) counts.operadores++;
        } catch(e) { console.warn('  ⚠ Operador:', o.id, e.message); }
    }
    console.log('  ✅ Operadores: ', counts.operadores);

    // ── VENDEDORES ────────────────────────────────────────────────────────────
    for (const v of vendedores.filter(v => v && v.id)) {
        try {
            await pool.request()
                .input('id', sql.VarChar, String(v.id).slice(0,50))
                .input('nombre', sql.VarChar, String(v.nombre||'').slice(0,255))
                .input('suc', sql.VarChar, String(v.sucursalId||v.id_sucursal||'S01').slice(0,10))
                .input('usr', sql.VarChar, String(v.userId||v.id_usuario||'').slice(0,10))
                .input('elim', sql.Bit, v.eliminado ? 1 : 0)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor=@id)
                    INSERT INTO dbo.Vendedores (id_vendedor,nombre,id_sucursal,id_usuario,eliminado) VALUES (@id,@nombre,@suc,@usr,@elim)
                    ELSE UPDATE dbo.Vendedores SET nombre=@nombre,eliminado=@elim WHERE id_vendedor=@id`);
            if (!v.eliminado) counts.vendedores++;
        } catch(e) { console.warn('  ⚠ Vendedor:', v.id, e.message); }
    }
    console.log('  ✅ Vendedores: ', counts.vendedores);

    // ── PROVEEDORES ───────────────────────────────────────────────────────────
    for (const p of proveedores.filter(p => p && p.id)) {
        try {
            const cj = Array.isArray(p.clientesCajon) ? JSON.stringify(p.clientesCajon) : '[]';
            await pool.request()
                .input('id', sql.VarChar, String(p.id).slice(0,50))
                .input('nombre', sql.VarChar, String(p.nombre||'').slice(0,255))
                .input('d1', sql.Float, p.desc1||0).input('d2', sql.Float, p.desc2||0).input('d3', sql.Float, p.desc3||0)
                .input('cj', sql.VarChar, cj.slice(0,2000))
                .input('tp', sql.VarChar, String(p.tipoPromo||'').slice(0,50))
                .input('fi', sql.VarChar, String(p.fechaInicio||'').slice(0,20))
                .input('ff', sql.VarChar, String(p.fechaFin||'').slice(0,20))
                .input('elim', sql.Bit, p.eliminado ? 1 : 0)
                .query(`IF NOT EXISTS (SELECT 1 FROM dbo.Proveedores WHERE id_proveedor=@id)
                    INSERT INTO dbo.Proveedores (id_proveedor,nombre,desc1,desc2,desc3,clientes_cajon_json,tipo_promo,fecha_inicio,fecha_fin,eliminado)
                    VALUES (@id,@nombre,@d1,@d2,@d3,@cj,@tp,@fi,@ff,@elim)
                    ELSE UPDATE dbo.Proveedores SET nombre=@nombre,desc1=@d1,desc2=@d2,desc3=@d3,clientes_cajon_json=@cj,eliminado=@elim WHERE id_proveedor=@id`);
            if (!p.eliminado) counts.proveedores++;
        } catch(e) { console.warn('  ⚠ Proveedor:', p.id, e.message); }
    }
    console.log('  ✅ Proveedores:', counts.proveedores);

    // ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────
    const r = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM dbo.Clientes    WHERE eliminado=0) AS clientes,
            (SELECT COUNT(*) FROM dbo.Operadores  WHERE eliminado=0) AS operadores,
            (SELECT COUNT(*) FROM dbo.Vendedores  WHERE eliminado=0) AS vendedores,
            (SELECT COUNT(*) FROM dbo.Proveedores WHERE eliminado=0) AS proveedores
    `);
    const t = r.recordset[0];
    console.log('\n📊 SQL SERVER AHORA TIENE:');
    console.log('  Clientes:   ', t.clientes);
    console.log('  Operadores: ', t.operadores);
    console.log('  Vendedores: ', t.vendedores);
    console.log('  Proveedores:', t.proveedores);
    console.log('\n🎉 ¡Listo! Todos los dispositivos verán estos datos.\n');
    process.exit(0);
}

importar().catch(e => { console.error('\n❌ ERROR:', e.message); process.exit(1); });
