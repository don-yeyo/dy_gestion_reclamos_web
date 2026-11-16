import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-03: Dashboard y Métricas Ejecutivas', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe cargar el Dashboard y visualizar los KPIs y gráficos mensuales/torta/progreso', async ({ page }) => {
        await page.goto('/');

        // Título del Dashboard
        await expect(page.locator('h1')).toContainText('Dashboard de Reclamos');

        // Tarjetas de KPIs
        await expect(page.locator('.kpi-card', { hasText: 'Total en Gestor' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Total en Gestor' }).locator('.kpi-value')).toContainText('4');

        await expect(page.locator('.kpi-card', { hasText: 'Pendientes Admin' })).toBeVisible();
        await expect(page.locator('.kpi-card', { hasText: 'Pendientes Admin' }).locator('.kpi-value')).toContainText('2');

        // Verificar que la grilla de "Últimos Reclamos Ingresados" ya no existe
        await expect(page.locator('text=Últimos Reclamos Ingresados')).toHaveCount(0);

        // Verificar que se renderizan las gráficas de barras mensuales, torta y progreso
        await expect(page.getByTestId('chart-mensual-barras')).toBeVisible();
        await expect(page.locator('text=Evolución Mensual: Ingresados vs. Resueltos')).toBeVisible();

        await expect(page.getByTestId('chart-torta-estados')).toBeVisible();
        await expect(page.locator('text=Distribución por Estado Administrativo')).toBeVisible();

        await expect(page.getByTestId('chart-urgencia')).toBeVisible();
        await expect(page.getByTestId('chart-progreso-sectores')).toBeVisible();
    });

    test('debe navegar a la bandeja de reclamos desde el botón del Dashboard', async ({ page }) => {
        await page.goto('/');

        await page.locator('button', { hasText: 'Ver Bandeja de Reclamos' }).click();
        await expect(page).toHaveURL(/.*\/reclamos/);
        await expect(page.locator('h1')).toContainText('Listado de Reclamos');
    });
});
