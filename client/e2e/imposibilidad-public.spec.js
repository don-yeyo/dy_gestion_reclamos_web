import { test, expect } from '@playwright/test';
import { setupMockApi } from './fixtures/mockApi.js';

test.describe('CU-09: Portal Público de Imposibilidad de Compensación', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockApi(page);
    });

    test('debe mostrar error si se accede sin token', async ({ page }) => {
        await page.goto('/imposibilidad');
        await expect(page.locator('text=No se proporcionó ningún token de acción')).toBeVisible();
    });

    test('debe cargar los datos del reclamo con token válido y requerir motivo', async ({ page }) => {
        await page.goto('/imposibilidad?token=token_prueba_hmac_123');

        // Verificar datos del reclamo mostrados al supervisor
        await expect(page.locator('text=REC-2026-003')).toBeVisible();
        await expect(page.locator('text=Informar Imposibilidad de Entrega')).toBeVisible();

        // Seleccionar motivo e ingresar observaciones
        const selectMotivo = page.locator('select');
        await selectMotivo.selectOption({ index: 1 }); // Primera opción de motivo válida

        const txtObservaciones = page.locator('textarea');
        await txtObservaciones.fill('Se visitó el domicilio en dos oportunidades pero no se obtuvo respuesta.');

        // Enviar formulario
        const btnConfirmar = page.getByRole('button', { name: 'Confirmar Imposibilidad' });
        await btnConfirmar.click();

        // Verificar pantalla de éxito
        await expect(page.locator('text=Imposibilidad Registrada')).toBeVisible();
        await expect(page.locator('text=Hemos registrado correctamente la imposibilidad de entrega')).toBeVisible();
    });
});
