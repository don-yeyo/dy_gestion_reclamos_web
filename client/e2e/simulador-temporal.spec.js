import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-11: Simulador Temporal de Seguimiento y Cron (/reclamos/:id -> Simulador)', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe abrir el modal del simulador temporal desde el expediente del reclamo', async ({ page }) => {
        // Abrir reclamo en curso
        await page.goto('/reclamos/REC-2026-003');

        // Verificar botón del simulador temporal
        const btnSimulador = page.getByTestId('btn-abrir-simulador');
        await expect(btnSimulador).toBeVisible();
        await btnSimulador.click();

        // Verificar título del modal
        await expect(page.locator('text=Simulador Temporal de Seguimiento (Cron)')).toBeVisible();
        await expect(page.locator('text=María Clara Sosa').first()).toBeVisible();

        // Verificar que el checkbox de Google Sheets esté desmarcado por defecto
        const checkSheets = page.locator('input[type="checkbox"]').first();
        await expect(checkSheets).not.toBeChecked();
        await expect(page.locator('text=DESACTIVADO (Recomendado): La simulación evalúa y actualiza localmente en MySQL')).toBeVisible();

        // Seleccionar +3 Días
        await page.locator('button:has-text("+3 Días")').click();

        // Ejecutar simulación
        const btnEjecutar = page.getByTestId('btn-ejecutar-simulacion');
        await btnEjecutar.click();

        // Verificar resultado del disparo en tiempo real
        await expect(page.locator('text=Resultado del Disparo de Simulación')).toBeVisible();
        await expect(page.locator('text=Recordatorio al Supervisor #1 de 3 enviado exitosamente')).toBeVisible();
        await expect(page.locator('text=Sheets protegido')).toBeVisible();
    });

    test('permite activar el checkbox de sincronización con Google Sheets mostrando advertencia', async ({ page }) => {
        await page.goto('/reclamos/REC-2026-003');
        await page.getByTestId('btn-abrir-simulador').click();

        const checkSheets = page.locator('input[type="checkbox"]').first();
        await expect(checkSheets).not.toBeChecked();

        // Marcar checkbox
        await checkSheets.check();
        await expect(checkSheets).toBeChecked();
        await expect(page.locator('text=ACTIVADO: Los cambios de estado generados por la simulación se escribirán en la planilla real')).toBeVisible();
    });
});
