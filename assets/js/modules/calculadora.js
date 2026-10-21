// assets/js/modules/calculadora.js
/**
 * Módulo Matemático SAGUA - Cumplimiento con la metodología de investigación KAWSAY
 */
export class CalculadoraHidrica {
  /**
   * Calcula la diferencia aparente, ajustada por derivaciones y la eficiencia de conducción.
   */
  static calcularIndicadores(qEntrada, qSalida, qDerivado = 0) {
    if (typeof qEntrada !== 'number' || typeof qSalida !== 'number' || typeof qDerivado !== 'number') {
        throw new Error("Los valores de caudal deben ser numéricos.");
    }
    if (qEntrada <= 0) {
        throw new Error("El caudal de entrada debe ser mayor a cero.");
    }
    if (qSalida < 0 || qDerivado < 0) {
        throw new Error("Los caudales de salida o derivación no pueden ser negativos.");
    }

    const qSalidaReal = qSalida + qDerivado; // Las derivaciones son salidas de distribución legítimas
    const diferenciaAparente = qEntrada - qSalida;
    const diferenciaAjustada = qEntrada - qSalidaReal;
    const porcentajeAparente = (diferenciaAparente / qEntrada) * 100;
    const eficienciaAparente = (qSalidaReal / qEntrada) * 100;

    return {
        diferenciaAparente_ls: Number(diferenciaAparente.toFixed(2)),
        diferenciaAjustada_ls: Number(diferenciaAjustada.toFixed(2)),
        diferenciaPorcentual: Number(porcentajeAparente.toFixed(2)),
        eficienciaAparente_pct: Number(eficienciaAparente.toFixed(2))
    };
  }
}