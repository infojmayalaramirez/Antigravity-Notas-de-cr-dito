/**
 * migrar_localStorage_a_sql.js
 * 
 * Lee los datos directamente del localStorage del navegador
 * exportados por el usuario y los sube TODOS a SQL Server.
 * 
 * Uso:
 *   1. En el navegador (nccansa.netlify.app), abrir Consola (F12) y ejecutar:
 *         copy(JSON.stringify(Object.fromEntries(Object.entries(localStorage))))
 *   2. Pegar el resultado en un archivo llamado: localStorage_export.json
 *   3. Correr: node migrar_localStorage_a_sql.js
 */

const sql = require('mssql');
const fs  = require('fs');
const path = require('path');

const dbConfig = {
    user: 'sa', password: 'sql2022', server: 'localhost', database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true }
};

// ── Leer el archivo exportado ─────────────────────────────────────────────────
const exportFile = path.join(__dirname, 'localStorage_export.json');
if (!fs.existsSync(exportFile)) {
    console.error('\n❌ No se encontró el archivo localStorage_export.json');
    console.error('   Sigue las instrucciones al inicio de este archivo.\n');
    process.exit(1);
}

const raw   = JSON.parse(fs.readFileSync(exportFile, 'utf8'));

// Intentar extraer los arrays de distintas claves posibles
function parseKey(raw, ...keys) {
    for (const k of keys) {
        if (raw[k]) {
            try { const v = JSON.parse(raw[k]); if (Array.isArray(v)) return v; } catch {}
        }
    }
    return [];
}

const clientes    = parseKey(raw, 'ca_clientes',    'clientes');
const operadores  = parseKey(raw, 'ca_operadores',  'operadores');
const vendedores  = parseKey(raw, 'ca_vendedores',  'vendedores');
const proveedores = parseKey(raw, 'ca_proveedores', 'proveedores');
const usuarios    = parseKey(raw, 'ca_usuarios',    'usuarios');
const sucursales  = parseKey(raw, 'ca_sucursales',  'sucursales');
const notas       = parseKey(raw, 'ca_notas',       'notas');

console.log('\n📦 DATOS ENCONTRADOS EN LOCALSTORAGE:');
console.log('  Clientes:   ', clientes.length);
console.log('  Operadores: ', operadores.length);
console.log('  Vendedores: ', vendedores.length);
console.log('  Proveedores:', proveedores.length);
console.log('  Usuarios:   ', usuarios.length);
console.log('  Sucursales: ', sucursales.length);
console.log('  Notas:      ', notas.length);
console.log('');

async function migrate() {
    const pool = await sql.connect(dbConfig);
    console.log('✅ Conectado a SQL Server CasaAyalaDB\n');

    // ── CLIENTES ─────────────────────────────────────────────────────────────
    let n = 0;
    for (const c of clientes.filter(c => c && c.id && !c.eliminado)) {
        try {
            await pool.request()
                .input('id',        sql.VarChar, String(c.id).slice(0, 50))
                .input('nombre',    sql.VarChar, String(c.nombre || '').slice(0, 255))
                .input('codigo',    sql.VarChar, String(c.codigoInterno || c.codigo || c.id).slice(0, 50))
                .input('descuento', sql.Bit,     (c.tieneDerechoDescuento || c.derechoDescuento) ? 1 : 0)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente=@id)
                        INSERT INTO dbo.Clientes (id_cliente, nombre, codigo_interno, tiene_derecho_descuento, eliminado)
                        VALUES (@id, @nombre, @codigo, @descuento, 0)
                    ELSE
                        UPDATE dbo.Clientes SET nombre=@nombre, codigo_interno=@codigo, tiene_derecho_descuento=@descuento WHERE id_cliente=@id
                `);
            n++;
        } catch(e) { console.warn('  ⚠ Cliente:', c.id, e.message); }
    }
    console.log(`  ✅ Clientes migrados: ${n}`);

    // ── OPERADORES ────────────────────────────────────────────────────────────
    n = 0;
    for (const o of operadores.filter(o => o && o.id && !o.eliminado)) {
        try {
            await pool.request()
                .input('id',     sql.VarChar, String(o.id).slice(0, 50))
                .input('nombre', sql.VarChar, String(o.nombre || '').slice(0, 255))
                .input('puesto', sql.VarChar, String(o.puesto || '').slice(0, 255))
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador=@id)
                        INSERT INTO dbo.Operadores (id_operador, nombre, puesto, eliminado) VALUES (@id, @nombre, @puesto, 0)
                    ELSE
                        UPDATE dbo.Operadores SET nombre=@nombre, puesto=@puesto WHERE id_operador=@id
                `);
            n++;
        } catch(e) { console.warn('  ⚠ Operador:', o.id, e.message); }
    }
    console.log(`  ✅ Operadores migrados: ${n}`);

    // ── VENDEDORES ────────────────────────────────────────────────────────────
    n = 0;
    for (const v of vendedores.filter(v => v && v.id && !v.eliminado)) {
        try {
            await pool.request()
                .input('id',      sql.VarChar, String(v.id).slice(0, 50))
                .input('nombre',  sql.VarChar, String(v.nombre || '').slice(0, 255))
                .input('sucursal',sql.VarChar, String(v.sucursalId || v.id_sucursal || 'S01').slice(0, 10))
                .input('usuario', sql.VarChar, String(v.userId || v.id_usuario || '').slice(0, 10))
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor=@id)
                        INSERT INTO dbo.Vendedores (id_vendedor, nombre, id_sucursal, id_usuario, eliminado) VALUES (@id, @nombre, @sucursal, @usuario, 0)
                    ELSE
                        UPDATE dbo.Vendedores SET nombre=@nombre WHERE id_vendedor=@id
                `);
            n++;
        } catch(e) { console.warn('  ⚠ Vendedor:', v.id, e.message); }
    }
    console.log(`  ✅ Vendedores migrados: ${n}`);

    // ── PROVEEDORES ───────────────────────────────────────────────────────────
    n = 0;
    for (const p of proveedores.filter(p => p && p.id && !p.eliminado)) {
        try {
            const cj = Array.isArray(p.clientesCajon) ? JSON.stringify(p.clientesCajon) : '[]';
            await pool.request()
                .input('id',          sql.VarChar, String(p.id).slice(0, 50))
                .input('nombre',      sql.VarChar, String(p.nombre || '').slice(0, 255))
                .input('desc1',       sql.Float,   p.desc1 || 0)
                .input('desc2',       sql.Float,   p.desc2 || 0)
                .input('desc3',       sql.Float,   p.desc3 || 0)
                .input('clientes',    sql.VarChar, cj.slice(0, 2000))
                .input('tipo_promo',  sql.VarChar, String(p.tipoPromo || '').slice(0, 50))
                .input('fecha_inicio',sql.VarChar, String(p.fechaInicio || '').slice(0, 20))
                .input('fecha_fin',   sql.VarChar, String(p.fechaFin   || '').slice(0, 20))
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Proveedores WHERE id_proveedor=@id)
                        INSERT INTO dbo.Proveedores (id_proveedor, nombre, desc1, desc2, desc3, clientes_cajon, tipo_promo, fecha_inicio, fecha_fin, eliminado)
                        VALUES (@id, @nombre, @desc1, @desc2, @desc3, @clientes, @tipo_promo, @fecha_inicio, @fecha_fin, 0)
                    ELSE
                        UPDATE dbo.Proveedores SET nombre=@nombre, desc1=@desc1, desc2=@desc2, desc3=@desc3,
                            clientes_cajon=@clientes, tipo_promo=@tipo_promo, fecha_inicio=@fecha_inicio, fecha_fin=@fecha_fin
                        WHERE id_proveedor=@id
                `);
            n++;
        } catch(e) { console.warn('  ⚠ Proveedor:', p.id, e.message); }
    }
    console.log(`  ✅ Proveedores migrados: ${n}`);

    // ── USUARIOS ──────────────────────────────────────────────────────────────
    n = 0;
    for (const u of usuarios.filter(u => u && (u.id || u.id_usuario))) {
        try {
            const uid = String(u.id || u.id_usuario).slice(0, 10);
            await pool.request()
                .input('id',      sql.VarChar, uid)
                .input('nombre',  sql.VarChar, String(u.nombre || '').slice(0, 255))
                .input('rol',     sql.VarChar, String(u.rol || 'Vendedor').slice(0, 50))
                .input('pin',     sql.VarChar, String(u.pin || '').slice(0, 20))
                .input('sucursal',sql.VarChar, String(u.sucursalId || u.id_sucursal || 'S01').slice(0, 10))
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE id_usuario=@id)
                        INSERT INTO dbo.Usuarios (id_usuario, nombre, rol, pin, id_sucursal) VALUES (@id, @nombre, @rol, @pin, @sucursal)
                    ELSE
                        UPDATE dbo.Usuarios SET nombre=@nombre, rol=@rol, pin=@pin WHERE id_usuario=@id
                `);
            n++;
        } catch(e) { console.warn('  ⚠ Usuario:', u.id, e.message); }
    }
    console.log(`  ✅ Usuarios migrados: ${n}`);

    // ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────
    const r = await pool.request().query(`
        SELECT
            (SELECT COUNT(*) FROM dbo.Clientes    WHERE eliminado=0) AS clientes,
            (SELECT COUNT(*) FROM dbo.Operadores  WHERE eliminado=0) AS operadores,
            (SELECT COUNT(*) FROM dbo.Vendedores  WHERE eliminado=0) AS vendedores,
            (SELECT COUNT(*) FROM dbo.Proveedores WHERE eliminado=0) AS proveedores,
            (SELECT COUNT(*) FROM dbo.Usuarios)                      AS usuarios
    `);
    const t = r.recordset[0];
    console.log('\n📊 SQL SERVER AHORA TIENE:');
    console.log(`  Clientes:    ${t.clientes}`);
    console.log(`  Operadores:  ${t.operadores}`);
    console.log(`  Vendedores:  ${t.vendedores}`);
    console.log(`  Proveedores: ${t.proveedores}`);
    console.log(`  Usuarios:    ${t.usuarios}`);
    console.log('\n🎉 Migración completa. Todos los dispositivos verán estos datos.\n');

    process.exit(0);
}

migrate().catch(e => { console.error('\n❌ ERROR:', e.message); process.exit(1); });
