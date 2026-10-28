import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-12: Logs y Auditoría del Sistema (Emails y Configuraciones)', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe acceder a la sección de Logs desde el menú lateral y renderizar la página con sus KPIs', async ({ page }) => {
        await page.goto('/');

        // Abrir menú lateral
        const menuBtn = page.getByTitle('Menú de Navegación').or(page.locator('button.header-btn-icon').first());
        await menuBtn.click();

        // Encontrar enlace "Logs del Sistema"
        const navLogs = page.locator('.drawer-nav-item', { hasText: 'Logs del Sistema' });
        await expect(navLogs).toBeVisible();
        await navLogs.click();

        // Verificar URL y encabezados
        await expect(page).toHaveURL(/.*\/logs/);
        await expect(page.locator('h1')).toContainText('Logs y Auditoría del Sistema');

        // Verificar presencia de tarjetas KPI
        await expect(page.locator('text=Total Emails Emitidos')).toBeVisible();
        await expect(page.locator('text=Disparos Automáticos')).toBeVisible();
        await expect(page.locator('text=Disparos Manuales')).toBeVisible();
        await expect(page.locator('text=Cambios de Configuración')).toBeVisible();
    });

    test('debe listar eventos en la grilla distinguiendo disparos automáticos y manuales con sus motivos', async ({ page }) => {
        await page.goto('/logs');

        // Verificar columnas de la grilla
        const thead = page.locator('.data-table thead');
        await expect(thead).toContainText('Fecha y Hora');
        await expect(thead).toContainText('Categoría');
        await expect(thead).toContainText('Evento / Asunto / Motivo');
        await expect(thead).toContainText('Disparo');
        await expect(thead).toContainText('Destinatario / Actor');
        await expect(thead).toContainText('Estado');

        // Verificar filas mock
        const tbody = page.locator('.data-table tbody');
        await expect(tbody).toContainText('hugob@donyeyo.com.ar');
        await expect(tbody).toContainText('inocuidad@donyeyo.com.ar');
        await expect(tbody).toContainText('Auto');
        await expect(tbody).toContainText('Manual');
        await expect(tbody).toContainText('reglas_seguimiento');
    });

    test('debe abrir el modal de detalle al hacer clic en un log de email y mostrar su información completa', async ({ page }) => {
        await page.goto('/logs');

        // Clic en la fila del email a inocuidad (disparo manual)
        const rowInocuidad = page.locator('tr', { hasText: 'inocuidad@donyeyo.com.ar' });
        await rowInocuidad.click();

        // Verificar modal flotante
        const modal = page.locator('.modal-content-card');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Detalle de Emisión de Correo');
        await expect(modal).toContainText('inocuidad@donyeyo.com.ar');
        await expect(modal).toContainText('Disparo Manual');
        await expect(modal).toContainText('gabrielt@donyeyo.com.ar');
        await expect(modal).toContainText('#REC-2026-003');
        await expect(modal).toContainText('Reenvío manual de expediente técnico');

        // Cerrar modal
        await modal.getByRole('button', { name: 'Cerrar' }).click();
        await expect(modal).not.toBeVisible();
    });

    test('debe abrir el modal de detalle para un log de configuración y mostrar la comparativa de valores', async ({ page }) => {
        await page.goto('/logs');

        // Clic en la fila de configuración
        const rowConfig = page.locator('tr', { hasText: 'reglas_seguimiento' });
        await rowConfig.click();

        // Verificar modal flotante
        const modal = page.locator('.modal-content-card');
        await expect(modal).toBeVisible();
        await expect(modal).toContainText('Detalle de Modificación de Configuración');
        await expect(modal).toContainText('reglas_seguimiento');
        await expect(modal).toContainText('Creación de regla de seguimiento');
        await expect(modal).toContainText('Configuración Actualizada (Valores Guardados)');

        // Cerrar modal
        await modal.getByRole('button', { name: 'Cerrar' }).click();
        await expect(modal).not.toBeVisible();
    });
});
