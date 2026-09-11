const sql = require('mssql');
const dbConfig = {
    user: 'sa',
    password: 'sql2022',
    server: 'localhost',
    database: 'CasaAyalaDB',
    options: { encrypt: true, trustServerCertificate: true }
};

async function fixDatabase() {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request().query("DELETE FROM dbo.Usuarios WHERE email = 'sofia@casaayala.com' OR id_usuario = 'U05'");
        await pool.request().query("UPDATE dbo.Usuarios SET telefono = '3339567196' WHERE id_usuario = 'U01' OR email = 'cansagdl@gmail.com'");
        await pool.request().query("UPDATE dbo.Usuarios SET telefono = '3313613035' WHERE id_usuario = 'U02' OR email = 'consuelo.carrillo2022@gmail.com'");
        await pool.request().query("UPDATE dbo.Usuarios SET telefono = '6641234567' WHERE id_usuario = 'U04' OR email = 'laurasanchezvazquez07@gmail.com'");
        await pool.request().query("UPDATE dbo.Usuarios SET telefono = '6647654321' WHERE id_usuario = 'U48921' OR email = 'lafer7522@gmail.com'");

        const res = await pool.request().query("SELECT id_usuario, nombre, email, rol, telefono FROM dbo.Usuarios");
        console.log("Fixed Usuarios in SQL Server:", res.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixDatabase();
