// seed_sql.js
// Siembra todos los datos de catalog_store.json en SQL Server
// y corrige la sucursal SDO6-GDL -> Tijuana Matriz

const sql = require('mssql');
const fs = require('fs');

const dbConfig = {
    user: 'sa',
    password: 'sql2022',
    server: 'localhost',
    database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true }
};

const store = JSON.parse(fs.readFileSync('catalog_store.json', 'utf8'));

async function seed() {
    const pool = await sql.connect(dbConfig);
    console.log('Conectado a SQL Server.');

    // 1. Corregir SDO6-GDL -> Tijuana Matriz
    await pool.request().query(`
        UPDATE dbo.Sucursales SET nombre='Tijuana Matriz', direccion='Av. España #1168, Col. Moderna', activa_financiera=1 WHERE id_sucursal='S01';
        UPDATE dbo.Sucursales SET nombre='Mexicali Centro', direccion='Blvd. Benito Juárez #450, Col. Jardines', activa_financiera=1 WHERE id_sucursal='S02';
        UPDATE dbo.Sucursales SET nombre='Ensenada Puerto', direccion='Av. Ruiz #120, Col. Centro', activa_financiera=0 WHERE id_sucursal='S03';
    `);
    console.log('✅ Sucursales corregidas (SDO6-GDL → Tijuana Matriz)');

    // 2. Sembrar Clientes desde catalog_store.json
    let clientesSeeded = 0;
    for (const c of (store.clientes || [])) {
        if (!c || !c.id) continue;
        const id = String(c.id).slice(0, 50);
        const nombre = String(c.nombre || '').slice(0, 255);
        const codigo = String(c.codigo || c.codigoInterno || c.id).slice(0, 50);
        const descuento = c.derechoDescuento || c.tieneDerechoDescuento ? 1 : 0;
        try {
            await pool.request()
                .input('id_cliente', sql.VarChar, id)
                .input('nombre', sql.VarChar, nombre)
                .input('codigo_interno', sql.VarChar, codigo)
                .input('tiene_derecho_descuento', sql.Bit, descuento)
                .input('eliminado', sql.Bit, 0)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Clientes WHERE id_cliente=@id_cliente)
                        INSERT INTO dbo.Clientes (id_cliente, nombre, codigo_interno, tiene_derecho_descuento, eliminado)
                        VALUES (@id_cliente, @nombre, @codigo_interno, @tiene_derecho_descuento, @eliminado)
                    ELSE
                        UPDATE dbo.Clientes SET nombre=@nombre, codigo_interno=@codigo_interno, tiene_derecho_descuento=@tiene_derecho_descuento
                        WHERE id_cliente=@id_cliente
                `);
            clientesSeeded++;
        } catch (e) {
            console.warn('  Cliente error:', id, e.message);
        }
    }
    console.log(`✅ Clientes sembrados: ${clientesSeeded}`);

    // 3. Sembrar Operadores
    let opSeeded = 0;
    for (const o of (store.operadores || [])) {
        if (!o || !o.id) continue;
        const id = String(o.id).slice(0, 50);
        const nombre = String(o.nombre || '').slice(0, 255);
        const puesto = String(o.puesto || '').slice(0, 255);
        try {
            await pool.request()
                .input('id_operador', sql.VarChar, id)
                .input('nombre', sql.VarChar, nombre)
                .input('puesto', sql.VarChar, puesto)
                .input('eliminado', sql.Bit, o.eliminado ? 1 : 0)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Operadores WHERE id_operador=@id_operador)
                        INSERT INTO dbo.Operadores (id_operador, nombre, puesto, eliminado)
                        VALUES (@id_operador, @nombre, @puesto, @eliminado)
                    ELSE
                        UPDATE dbo.Operadores SET nombre=@nombre, puesto=@puesto WHERE id_operador=@id_operador
                `);
            opSeeded++;
        } catch (e) {
            console.warn('  Operador error:', id, e.message);
        }
    }
    console.log(`✅ Operadores sembrados: ${opSeeded}`);

    // 4. Sembrar Vendedores
    let vendSeeded = 0;
    for (const v of (store.vendedores || [])) {
        if (!v || !v.id) continue;
        const id = String(v.id).slice(0, 50);
        const nombre = String(v.nombre || '').slice(0, 255);
        const sucId = String(v.sucursalId || v.id_sucursal || 'S01').slice(0, 10);
        const userId = String(v.userId || v.id_usuario || '').slice(0, 10);
        try {
            await pool.request()
                .input('id_vendedor', sql.VarChar, id)
                .input('nombre', sql.VarChar, nombre)
                .input('id_sucursal', sql.VarChar, sucId)
                .input('id_usuario', sql.VarChar, userId)
                .input('eliminado', sql.Bit, v.eliminado ? 1 : 0)
                .query(`
                    IF NOT EXISTS (SELECT 1 FROM dbo.Vendedores WHERE id_vendedor=@id_vendedor)
                        INSERT INTO dbo.Vendedores (id_vendedor, nombre, id_sucursal, id_usuario, eliminado)
                        VALUES (@id_vendedor, @nombre, @id_sucursal, @id_usuario, @eliminado)
                    ELSE
                        UPDATE dbo.Vendedores SET nombre=@nombre WHERE id_vendedor=@id_vendedor
                `);
            vendSeeded++;
        } catch (e) {
            console.warn('  Vendedor error:', id, e.message);
        }
    }
    console.log(`✅ Vendedores sembrados: ${vendSeeded}`);

    // 5. Verificar resultado final
    const clientes = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.Clientes');
    const sucursales = await pool.request().query('SELECT nombre FROM dbo.Sucursales ORDER BY id_sucursal');
    console.log('\n📊 RESULTADO FINAL:');
    console.log('  Clientes en SQL:', clientes.recordset[0].total);
    console.log('  Sucursales:', sucursales.recordset.map(s => s.nombre).join(', '));
    
    process.exit(0);
}

seed().catch(e => { console.error('ERROR:', e); process.exit(1); });
