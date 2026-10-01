/**
 * setup_github_pages.js
 * - Lee el token de GitHub desde el credential store de Windows
 * - Hace el repo público (necesario para GitHub Pages gratis)
 * - Activa GitHub Pages desde la rama main
 */

const https = require('https');
const { spawnSync } = require('child_process');

// 1. Obtener token desde git credential store
const credResult = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    shell: true,
    timeout: 8000
});

const lines = (credResult.stdout || '').split('\n');
const passLine = lines.find(l => l.startsWith('password='));
const userLine = lines.find(l => l.startsWith('username='));

if (!passLine) {
    console.error('❌ No se pudo leer el token de GitHub desde las credenciales de Windows.');
    console.error('   Salida:', credResult.stdout?.substring(0, 200));
    console.error('   Error:', credResult.stderr?.substring(0, 200));
    process.exit(1);
}

const TOKEN = passLine.replace('password=', '').trim();
const USER = userLine ? userLine.replace('username=', '').trim() : 'infojmayalaramirez';
console.log('✅ Token encontrado para:', USER);

const REPO = 'Antigravity-Notas-de-cr-dito';
const OWNER = 'infojmayalaramirez';

function apiCall(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.github.com',
            path: path,
            method: method,
            headers: {
                'Authorization': `token ${TOKEN}`,
                'User-Agent': 'setup-github-pages-script',
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                catch { resolve({ status: res.statusCode, body: d }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    // 2. Verificar estado actual del repo
    console.log('\n📋 Verificando repo...');
    const repoInfo = await apiCall('GET', `/repos/${OWNER}/${REPO}`);
    if (repoInfo.status !== 200) {
        console.error('❌ No se pudo acceder al repo:', repoInfo.body.message || repoInfo.status);
        process.exit(1);
    }
    const isPrivate = repoInfo.body.private;
    console.log('   Visibilidad actual:', isPrivate ? 'privado' : 'público');

    // 3. Hacer el repo público si es privado
    if (isPrivate) {
        console.log('\n🔓 Haciendo el repo público...');
        const makePublic = await apiCall('PATCH', `/repos/${OWNER}/${REPO}`, { private: false });
        if (makePublic.status === 200) {
            console.log('   ✅ Repo ahora es PÚBLICO');
        } else {
            console.error('   ❌ Error al hacer público:', makePublic.body.message || makePublic.status);
            console.error('   Respuesta:', JSON.stringify(makePublic.body).substring(0, 300));
            process.exit(1);
        }
    } else {
        console.log('   ℹ️  Repo ya es público');
    }

    // 4. Activar GitHub Pages
    console.log('\n📄 Activando GitHub Pages...');
    const pagesResult = await apiCall('POST', `/repos/${OWNER}/${REPO}/pages`, {
        source: { branch: 'main', path: '/' }
    });

    if (pagesResult.status === 201) {
        console.log('   ✅ GitHub Pages activado!');
        console.log('   🌐 URL:', pagesResult.body.html_url || `https://${OWNER}.github.io/${REPO}/`);
        console.log('');
        console.log('🎉 En 2-3 minutos el sitio estará disponible en:');
        console.log(`   https://${OWNER}.github.io/${REPO}/`);
        console.log('');
        console.log('   ✅ Deploys automáticos en cada git push');
        console.log('   ✅ Gratis e ilimitado');
    } else if (pagesResult.status === 409) {
        console.log('   ℹ️  GitHub Pages ya estaba configurado');
        // Obtener URL existente
        const existing = await apiCall('GET', `/repos/${OWNER}/${REPO}/pages`);
        if (existing.status === 200) {
            console.log('   🌐 URL existente:', existing.body.html_url);
        }
    } else {
        console.error('   ❌ Error activando Pages:', pagesResult.body.message || pagesResult.status);
        console.error('   Detalle:', JSON.stringify(pagesResult.body).substring(0, 300));

        if (pagesResult.body.message && pagesResult.body.message.includes('upgrade')) {
            console.log('\n⚠️  GitHub Pages requiere plan de pago para repos privados.');
            console.log('   El repo ya se hizo público. Intente el comando nuevamente.');
        }
    }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
