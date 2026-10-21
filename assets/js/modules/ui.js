// assets/js/modules/ui.js

/**
 * Muestra un mensaje flotante de notificación en el formulario.
 */
export function showMsg(elementId, message, type = 'success') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `form-message ${type}`;
    el.style.display = 'block';
    setTimeout(() => { 
        if (el) el.style.display = 'none'; 
    }, 5000);
}

/**
 * Formatea fechas en formato estandarizado para Perú (America/Lima).
 */
export function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        return new Intl.DateTimeFormat('es-PE', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
        }).format(new Date(dateStr));
    } catch (e) {
        return dateStr;
    }
}

/**
 * Retorna la etiqueta HTML con estilo CSS según el estado de revisión o infraestructura.
 */
export function getStatusChip(status) {
    if (!status) return `<span class="status-chip status-pendiente">sin estado</span>`;
    const cleanStatus = status.replace(/_/g, ' ');
    return `<span class="status-chip status-${status}">${cleanStatus}</span>`;
}

/**
 * Diálogo estandarizado de confirmación antes de eliminar.
 */
export function confirmAction(mensaje = '¿Estás seguro de que deseas eliminar este registro?') {
    return window.confirm(mensaje);
}