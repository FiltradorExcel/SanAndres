# Gestor del Canal de San Andrés — versión inicial

Frontend estático con HTML, CSS y JavaScript, conectado a Supabase. Interfaz responsive de estilo moderno, panel de resumen, registro de sectores, inspecciones, mediciones, cálculo preliminar de balance de caudales y carga de evidencias.

## 1. Abrir en Visual Studio Code

1. Descomprime la carpeta `canal-san-andres` en tu computadora.
2. Abre esa carpeta completa en Visual Studio Code.
3. Instala la extensión **Live Server** (Ritwick Deyl) si aún no la tienes.
4. Haz clic derecho en `index.html` y selecciona **Open with Live Server**.
5. La aplicación abrirá una dirección local como `http://127.0.0.1:5500`.

No abras los HTML directamente con `file://`; usa Live Server para una experiencia de desarrollo consistente.

## 2. Supabase ya configurado

La conexión se encuentra en `assets/js/config.js` y usa la URL y clave `sb_publishable` proporcionadas para este proyecto. Una clave `sb_publishable` está diseñada para uso público en el navegador; **nunca** pongas una clave `service_role`, secretos ni contraseñas de usuarios en estos archivos.

## 3. Dar acceso a una cuenta

1. En Supabase, abre **Authentication → Users** y crea la cuenta desde la interfaz administrativa.
2. Copia el UUID de esa cuenta.
3. Comprueba que el trigger haya creado su fila en `public.profiles`.
4. Asigna el rol desde SQL Editor, reemplazando el UUID de ejemplo por el UUID real y el rol por `gerencia` o `tecnico`:

```sql
insert into public.user_roles (user_id, role, created_by)
values (
  'UUID-REAL-DEL-USUARIO',
  'gerencia',
  'UUID-REAL-DEL-USUARIO'
);
```

Solo una persona administradora autorizada debe ejecutar esa asignación. **No existe un formulario de autoasignación de rol en la aplicación.** Si el usuario ya tiene el rol, no repitas el INSERT: la clave primaria evita duplicados.

## 4. Tablas utilizadas

El frontend espera las tablas creadas por el esquema SQL inicial: `profiles`, `user_roles`, `sectores`, `campanas`, `inspecciones`, `mediciones`, `derivaciones`, `resultados_calculo`, `evaluaciones_criticidad`, `archivos_sector` y `audit_log`, entre otras. Las políticas RLS deben estar activas y verificadas.

Para registrar mediciones hace falta al menos una campaña en `public.campanas` y un sector activo en `public.sectores`. La primera versión no incluye aún una pantalla de administración de campañas; crea las campañas desde Supabase de forma autorizada o añade ese módulo antes de operar en campo.

## 5. Storage: `canal-evidencias`

La pantalla de evidencias carga archivos al bucket y registra su ruta en `public.archivos_sector`. El bucket debe ser **privado**. Configura políticas `SELECT`, `INSERT`, `UPDATE` y `DELETE` con roles objetivo `authenticated`, y expresiones que verifiquen `bucket_id = 'canal-evidencias'` y `public.current_app_role()` según el permiso. Para actualizar o eliminar, restringe a gerencia. Para `UPDATE`, configura tanto `USING` como `WITH CHECK`.

Comprueba que las políticas de Storage permiten subir y consultar archivos a los roles correctos antes de usar esta pantalla. No conviertas el bucket en público para evitar errores de permisos.

## 6. Fórmulas de la calculadora

Versión 1.0:
- Diferencia aparente (L/s) = caudal de entrada − caudal de salida.
- Diferencia ajustada (L/s) = entrada − salida − caudal derivado medido.
- Eficiencia aparente (%) = salida / entrada × 100.
- Diferencia aparente porcentual (%) = (entrada − salida) / entrada × 100.

Son indicadores aritméticos preliminares, no una prueba por sí solos de pérdidas por filtración. Antes de interpretar resultados se deben documentar la simultaneidad y método de medición, incertidumbre, derivaciones, almacenamiento y condiciones del canal. La versión inicial guarda resultados como pendientes; la pantalla de aprobación todavía es de consulta y no ejecuta aprobaciones.

## 7. Antes de usar con datos reales

- Verifica las políticas RLS tabla por tabla con cuentas separadas de gerencia y técnico.
- Revisa las políticas de Storage desde una sesión autenticada de cada rol.
- Confirma que una cuenta sin rol no pueda acceder a los módulos.
- Revisa las reglas de perfiles: los usuarios no deben poder modificar campos sensibles como `activo` o asignarse roles.
- Prueba primero con datos ficticios. Esta versión es una base de desarrollo, no una auditoría de seguridad ni un sistema validado para decisiones hidráulicas.

## Archivos principales

- `index.html`: inicio de sesión.
- `dashboard.html`: indicadores, estado de inspecciones y accesos rápidos.
- `sectores.html`: registro de sectores.
- `inspecciones.html`: registro de inspecciones.
- `mediciones.html`: registro de caudales.
- `calculadora.html`: cálculo preliminar y guardado para revisión.
- `evidencias.html`: carga de archivos y registro de metadatos.
- `aprobaciones.html`: consulta de registros pendientes para gerencia.
- `assets/css/styles.css`: diseño responsive.
- `assets/js/`: conexión y lógica por módulo.
