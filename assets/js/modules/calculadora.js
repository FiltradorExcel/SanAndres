// assets/js/modules/calculadora.js
/**
 * Módulo matemático SAGUA.
 * Las funciones devuelven estimaciones y no sustituyen una medición hidráulica
 * realizada con instrumentación y levantamiento geométrico adecuados.
 */
export class CalculadoraHidrica {
    /**
     * Aforo por flotador:
     * A = ancho × profundidad (aproximación rectangular)
     * Vs = distancia / tiempo
     * Vm = Vs × coeficiente
     * Q = A × Vm
     */
    static calcularAforoFlotador(ancho, profundidad, distancia, tiempo, coeficiente = 0.85) {
        const valores = { ancho, profundidad, distancia, tiempo, coeficiente };
        for (const [nombre, valor] of Object.entries(valores)) {
            if (typeof valor !== 'number' || !Number.isFinite(valor)) {
                throw new Error(`El valor ${nombre} debe ser numérico.`);
            }
            if (valor <= 0) throw new Error(`El valor ${nombre} debe ser mayor que cero.`);
        }
        if (coeficiente > 1.2) {
            throw new Error('El coeficiente debe ser razonable y no superar 1.20.');
        }

        const area = ancho * profundidad;
        const velocidadSuperficial = distancia / tiempo;
        const velocidadMedia = velocidadSuperficial * coeficiente;
        const caudalM3S = area * velocidadMedia;
        const caudalLS = caudalM3S * 1000;

        return {
            area_m2: Number(area.toFixed(4)),
            velocidad_superficial_ms: Number(velocidadSuperficial.toFixed(4)),
            velocidad_media_ms: Number(velocidadMedia.toFixed(4)),
            caudal_m3_s: Number(caudalM3S.toFixed(6)),
            caudal_l_s: Number(caudalLS.toFixed(3))
        };
    }

    /**
     * Comparación descriptiva entre dos caudales medidos.
     * No clasifica automáticamente la diferencia como pérdida física.
     */
    static compararCaudales(caudalAnterior, caudalPosterior) {
        if (![caudalAnterior, caudalPosterior].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) {
            throw new Error('Los caudales deben ser números válidos no negativos.');
        }
        const diferencia = caudalPosterior - caudalAnterior;
        const variacionPct = caudalAnterior > 0 ? (diferencia / caudalAnterior) * 100 : null;
        return {
            diferencia_ls: Number(diferencia.toFixed(3)),
            variacion_pct: variacionPct == null ? null : Number(variacionPct.toFixed(2))
        };
    }

    /**
     * Compatibilidad con cálculos de balance anteriores.
     * Usar únicamente cuando entrada, salida y derivaciones correspondan
     * a puntos hidráulicamente relacionados y mediciones comparables.
     */
    static calcularIndicadores(qEntrada, qSalida, qDerivado = 0) {
        if (![qEntrada, qSalida, qDerivado].every(v => typeof v === 'number' && Number.isFinite(v))) {
            throw new Error('Los valores de caudal deben ser numéricos.');
        }
        if (qEntrada <= 0) throw new Error('El caudal de entrada debe ser mayor a cero.');
        if (qSalida < 0 || qDerivado < 0) throw new Error('Los caudales de salida o derivación no pueden ser negativos.');

        const qSalidaTotal = qSalida + qDerivado;
        const diferenciaAparente = qEntrada - qSalida;
        const diferenciaAjustada = qEntrada - qSalidaTotal;
        const porcentajeDiferencia = (diferenciaAparente / qEntrada) * 100;
        const relacionSalidaEntrada = (qSalidaTotal / qEntrada) * 100;

        return {
            diferenciaAparente_ls: Number(diferenciaAparente.toFixed(2)),
            diferenciaAjustada_ls: Number(diferenciaAjustada.toFixed(2)),
            diferenciaPorcentual: Number(porcentajeDiferencia.toFixed(2)),
            eficienciaAparente_pct: Number(relacionSalidaEntrada.toFixed(2))
        };
    }
}
