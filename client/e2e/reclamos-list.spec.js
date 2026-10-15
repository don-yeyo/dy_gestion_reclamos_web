import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-04: Listado General y Filtros de Reclamos', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe cargar la lista de reclamos y permitir búsqueda por texto libre', async ({ page }) => {
        await page.goto('/reclamos');

        // Verificar título de la página
        await expect(page.locator('h1')).toContainText('Listado de Reclamos');

        // Verificar que los 4 reclamos mock se muestran inicialmente
        await expect(page.locator('table tbody tr')).toHaveCount(4);

        // Búsqueda por texto: "Ana"
        const searchInput = page.locator('input[placeholder*="Buscar por ID"]');
        await searchInput.fill('Ana');

        // Debe quedar solo REC-2026-001
        await expect(page.locator('table tbody tr')).toHaveCount(1);
        await expect(page.locator('td', { hasText: 'REC-2026-001' })).toBeVisible();

        // Limpiar búsqueda vaciando el input
        await searchInput.fill('');
        await expect(page.locator('table tbody tr')).toHaveCount(4);
    });

    test('debe filtrar reclamos por Estado Administración', async ({ page }) => {
        await page.goto('/reclamos');

        // Seleccionar filtro Estado Admin: "Finalizado"
        const selectAdmin = page.locator('.filter-box', { hasText: 'Estado Administración' }).locator('select');
        await selectAdmin.selectOption('Finalizado');

        // Solo debe figurar REC-2026-004
        await expect(page.locator('table tbody tr')).toHaveCount(1);
        await expect(page.locator('td', { hasText: 'REC-2026-004' })).toBeVisible();
    });

    test('debe filtrar reclamos por Estado Consumidor (incluyendo FSR)', async ({ page }) => {
        await page.goto('/reclamos');

        // Seleccionar filtro Estado Consumidor: "FSR"
        const selectConsumidor = page.locator('.filter-box', { hasText: 'Estado Consumidor' }).locator('select');
        await selectConsumidor.selectOption('FSR');

        // Debe filtrar y mostrar únicamente el caso con FSR
        await expect(page.locator('table tbody tr')).toHaveCount(1);
        await expect(page.locator('td', { hasText: 'REC-2026-004' })).toBeVisible();
        await expect(page.locator('.badge', { hasText: 'FSR' })).toBeVisible();
    });

    test('debe abrir el modal de detalle al hacer click en un reclamo de la grilla', async ({ page }) => {
        await page.goto('/reclamos');

        // Click en la fila de REC-2026-002
        await page.locator('tr', { hasText: 'REC-2026-002' }).click();

        // Verificar modal
        await expect(page.locator('.modal-overlay')).toBeVisible();
        await expect(page.locator('.modal-header')).toContainText('REC-2026-002');
    });
});
