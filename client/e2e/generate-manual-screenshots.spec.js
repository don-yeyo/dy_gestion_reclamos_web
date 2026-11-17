import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';
import path from 'path';

const outputDir = path.resolve(process.cwd(), '../docs/manual/images');

test.describe('Capturador de Pantallas del Gestor para Manual de Usuario - Final', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1366, height: 850 });
        await setupMockApi(page);

        // Mock adicional para configuración general
        await page.route('**/api/configuracion', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: [
                            { clave: 'SLA_DIAS_CORTE', valor: '5', categoria: 'tiempos', etiqueta: 'Días límite de resolución', descripcion: 'Días hábiles máximos para resolver un reclamo' },
                            { clave: 'CORTE_SLA_SEGUIMIENTO_SUPERVISOR', valor: '3', categoria: 'tiempos', etiqueta: 'Alerta supervisor (días)', descripcion: 'Plazo para primer recordatorio' },
                            { clave: 'EMAIL_LOGO_URL', valor: 'https://donyeyo.com.ar/images/donyeyo-logo.svg', categoria: 'notificaciones', etiqueta: 'Logotipo en correos', descripcion: 'URL del logo institucional' },
                            { clave: 'MENSAJE_CONSERVAR_MUESTRA', valor: 'Por favor conserve el producto y su empaque original para facilitar el análisis por parte de nuestro laboratorio.', categoria: 'portal_web', etiqueta: 'Aviso de conservación de muestra', descripcion: 'Texto visible al consumidor al cargar el reclamo' },
                            { clave: 'EMAIL_FOOTER_TEXT', valor: 'Don Yeyo S.A. - Planta Industrial Chacabuco, Bs. As.', categoria: 'notificaciones', etiqueta: 'Pie de firma en correos', descripcion: 'Firma legal en notificaciones automáticas' }
                        ]
                    })
                });
            } else {
                await route.continue();
            }
        });

        const mockCategorias = [
            { id: 1, nombre: 'PANES', emails_notificacion: 'laboratorio.panes@donyeyo.com.ar', inocuidad_emails: 'laboratorio.panes@donyeyo.com.ar', activo: 1, created_at: '2026-11-15' },
            { id: 2, nombre: 'PASTAS', emails_notificacion: 'laboratorio.pastas@donyeyo.com.ar', inocuidad_emails: 'laboratorio.pastas@donyeyo.com.ar', activo: 1, created_at: '2026-11-15' },
            { id: 3, nombre: 'TAPAS', emails_notificacion: 'laboratorio.tapas@donyeyo.com.ar', inocuidad_emails: 'laboratorio.tapas@donyeyo.com.ar', activo: 1, created_at: '2026-11-15' },
            { id: 4, nombre: 'PIZZAS', emails_notificacion: 'calidad@donyeyo.com.ar', inocuidad_emails: 'calidad@donyeyo.com.ar', activo: 1, created_at: '2026-11-15' }
        ];

        await page.route('**/api/categorias**', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: mockCategorias
                })
            });
        });
    });

    test('05: Capturar Categorías de Inocuidad', async ({ page }) => {
        await page.goto('/configuracion');
        await page.locator('button', { hasText: 'Categorías & Grupos Inocuidad' }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(outputDir, '05-configuracion-categorias.png') });
    });

    test('11: Capturar Cobertura Supervisores', async ({ page }) => {
        await page.goto('/');
        await page.locator('.burger-btn').click();
        await page.locator('button', { hasText: 'Cobertura Supervisores' }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(outputDir, '11-cobertura-supervisores.png') });
    });

    test('12: Capturar Reglas de Cortesía', async ({ page }) => {
        await page.goto('/');
        await page.locator('.burger-btn').click();
        await page.locator('button', { hasText: 'Reglas de Cortesía' }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(outputDir, '12-reglas-cortesia.png') });
    });
});
