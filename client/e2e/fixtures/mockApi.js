import { mockSupervisores, mockReclamos } from './mockData.js';

export async function setupMockApi(page, customReclamos = null) {
    let reclamos = customReclamos ? [...customReclamos] : JSON.parse(JSON.stringify(mockReclamos));

    // Mock autenticación
    await page.route('**/api/auth/validate', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                token: 'mock-jwt-token-testing',
                user: {
                    email: 'gabrielt@donyeyo.com.ar',
                    name: 'Gabriel Tonelli (Testing)',
                    role: 'admin'
                }
            })
        });
    });

    await page.route('**/api/auth/me', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                user: {
                    email: 'gabrielt@donyeyo.com.ar',
                    name: 'Gabriel Tonelli (Testing)',
                    role: 'admin'
                }
            })
        });
    });

    // Mock supervisores
    await page.route('**/api/supervisores', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                supervisores: mockSupervisores
            })
        });
    });

    // Mock listado de reclamos
    await page.route('**/api/reclamos', async route => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    total: reclamos.length,
                    data: reclamos,
                    reclamos: reclamos
                })
            });
        } else {
            await route.continue();
        }
    });

    // Mock acciones sobre reclamos individuales y sub-rutas anidadas
    await page.route('**/api/reclamos/**', async route => {
        const url = route.request().url();
        const method = route.request().method();

        // Asignar supervisor
        if (url.includes('/supervisor') && method === 'PATCH') {
            const body = route.request().postDataJSON();
            const id = url.split('/api/reclamos/')[1].split('/supervisor')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                r.supervisor = body.supervisor;
                r.supervisor_asignado = body.supervisor;
                r.supervisor_email = body.email;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Supervisor asignado exitosamente' })
            });
            return;
        }

        // Actualizar estado admin (Aprobar / Desaprobar)
        if (url.includes('/estado-admin') && method === 'PATCH') {
            const body = route.request().postDataJSON();
            const id = url.split('/api/reclamos/')[1].split('/estado-admin')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                r.estado_admin = body.estado;
                if (body.estado === 'En curso' || body.estado === 'Aprobado') {
                    r.estado_supervisor = 'Pendiente';
                    r.estado_inocuidad = 'Pendiente';
                    r.estado_consumidor = 'En curso';
                }
                if (body.estado === 'Desaprobado') {
                    r.admin_motivo_desaprobado = body.motivo_desaprobado || 'Motivo de prueba';
                }
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Estado administrativo actualizado' })
            });
            return;
        }

        // Reenviar email a inocuidad
        if (url.includes('/reenviar-inocuidad') && method === 'POST') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Expediente reenviado a Calidad & Inocuidad con éxito.' })
            });
            return;
        }

        // Reenviar email a supervisor
        if (url.includes('/reenviar-supervisor') && method === 'POST') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Instrucciones reenviadas al supervisor comercial con éxito.' })
            });
            return;
        }

        // GET de reclamo individual
        if (method === 'GET') {
            const id = url.split('/api/reclamos/')[1].split('?')[0];
            const r = reclamos.find(x => x.id === id || x.nro_reclamo === id);
            if (r) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, data: r, reclamo: r })
                });
                return;
            }
        }

        await route.continue();
    });

    // Mock Portal Público de Imposibilidad
    await page.route('**/api/public/actions/verify*', async route => {
        const payloadData = {
            reclamoId: 'REC-2026-003',
            id_reclamo: 'REC-2026-003',
            nro_reclamo: 'REC-2026-003',
            id: 'REC-2026-003',
            consumidor: 'María Clara Sosa',
            cliente: 'María Clara Sosa',
            producto: 'Bollos de Salvado Don Yeyo',
            localidad: 'Tigre',
            direccion: 'Cazón 800',
            supervisor: 'Gustavo Orgaz'
        };
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                payload: payloadData,
                data: payloadData
            })
        });
    });

    await page.route('**/api/public/actions/supervisor-imposibilidad', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                message: 'Imposibilidad de compensación registrada exitosamente.'
            })
        });
    });
}
