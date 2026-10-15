import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-03: Dashboard y Métricas Ejecutivas', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe cargar el Dashboard y visualizar los KPIs y reclamos recientes', async ({ page }) => {
        await page.goto('/');

        // Título del Dashboard
        await expect(page.locator('h1')).toContainText('Dashboard de Reclamos');

        // Tarjetas de KPIs
        await expect(page.locator('.kpi-card', { hasText: 'Total en Gestor' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Total en Gestor' }).locator('.kpi-value')).toContainText('4');

        await expect(page.locator('.kpi-card', { hasText: 'Pendientes Admin' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Pendientes Admin' }).locator('.kpi-value')).toContainText('2');

        // Tabla de reclamos recientes
        await expect(page.locator('text=Últimos Reclamos Ingresados')).toBeVisible();
        await expect(page.locator('table')).toBeVisible();

        // Verificar columnas de la tabla con exact match
        await expect(page.getByRole('columnheader', { name: 'ID', exact: true })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Consumidor', exact: true }).first()).toBeVisible();

        // Verificar reclamo REC-2026-001
        await expect(page.locator('td', { hasText: 'REC-2026-001' })).toBeVisible();
        await expect(page.locator('td', { hasText: 'Ana Laura Gómez' })).toBeVisible();

        // Verificar badge FSR en REC-2026-004
        await expect(page.locator('td', { hasText: 'REC-2026-004' })).toBeVisible();
        await expect(page.locator('.badge', { hasText: 'FSR' })).toBeVisible();
    });

    test('debe abrir el modal de detalle al hacer click en un reclamo de la tabla', async ({ page }) => {
        await page.goto('/');

        // Click en la fila del reclamo REC-2026-001 (navega a /reclamos?id=REC-2026-001)
        const filaReclamo = page.locator('tr', { hasText: 'REC-2026-001' });
        await filaReclamo.click();

        // Debe desplegarse el modal sincronizado por query param id
        await expect(page.locator('.modal-overlay')).toBeVisible();
        await expect(page.locator('.modal-header')).toContainText('REC-2026-001');

        // Debe contener las 4 cards del flujo
        await expect(page.locator('text=1. Ingreso')).toBeVisible();
        await expect(page.locator('text=2. Calidad & Inocuidad')).toBeVisible();
        await expect(page.locator('text=3. Acción de Compensación')).toBeVisible();
        await expect(page.locator('text=4. Consumidor')).toBeVisible();
    });
});
