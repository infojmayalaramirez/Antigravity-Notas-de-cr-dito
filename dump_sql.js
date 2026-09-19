const sql = require('mssql');
const dbConfig = {
    user: 'sa',
    password: 'sql2022',
    server: 'localhost',
    database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true }
};

async function dumpAll() {
    try {
        const pool = await sql.connect(dbConfig);
        const tables = ['Usuarios', 'Sucursales', 'Clientes', 'Operadores', 'Vendedores', 'Proveedores', 'Presupuestos', 'Notas'];
        for (const t of tables) {
            try {
                const res = await pool.request().query(`SELECT * FROM dbo.${t}`);
                console.log(`=== TABLE dbo.${t} (${res.recordset.length} rows) ===`);
                console.log(JSON.stringify(res.recordset, null, 2));
            } catch (e) {
                console.log(`=== TABLE dbo.${t} ERROR: ${e.message} ===`);
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('SQL Connection Error:', err);
        process.exit(1);
    }
}

dumpAll();
