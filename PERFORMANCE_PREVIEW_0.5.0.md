# REEBOT LAB v0.5.0 — Performance Preview

REEBI ya puede convertir un diagnóstico en una mejora real, siempre bajo control del usuario.

## Monitor de rendimiento

- Todos los módulos locales se actualizan cada segundo.
- CPU muestra modelo, núcleos, hilos, uso y reloj efectivo frente a frecuencia base y boost oficial.
- GPU reúne carga y VRAM en una sola gráfica, además de temperatura, potencia, P-State y proceso con mayor uso de VRAM.
- Las barras de reloj se dividen en `BASE`, `BOOST` y `XOC`. Pasar la base es boost normal; XOC comienza después de la referencia boost.
- Cuando NVIDIA App informa afinamiento automático, REEBOT muestra el offset exacto. En el equipo de desarrollo detecta `GPU +85 MHz` y `VRAM +200 MHz`.
- Un perfil guardado no se presenta como activo si otra fuente del controlador ofrece el ajuste aplicado.

## Flujo

1. Windows mide CPU, RAM, prioridad, sesión, ruta y editor de los procesos más activos.
2. El agente elimina procesos protegidos y crea una lista cerrada de candidatos.
3. REEBI ordena y explica esos candidatos sin poder inventar procesos ni acciones.
4. La app muestra beneficio, riesgo y cambio exacto.
5. El usuario confirma o cancela.
6. El agente vuelve a validar la identidad del proceso antes de actuar.

## Acciones disponibles

- **Bajar prioridad:** reduce la competencia por CPU sin cerrar la aplicación. Se puede deshacer durante una hora.
- **Pausar cinco minutos:** congela temporalmente una tarea secundaria. Un watchdog independiente la reanuda automáticamente incluso si REEBOT se cierra.

## Límites de seguridad

- Las acciones sólo funcionan desde la app local en `http://localhost:3000`.
- La versión web publicada no puede modificar la PC.
- REEBI no recibe acceso libre a PowerShell.
- Windows, controladores, procesos de otras sesiones, Ollama y REEBOT están protegidos.
- Cada acción queda registrada localmente y utiliza un permiso temporal de un solo uso.

## Actualizaciones incrementales

- `REEBOT LAB Updater.exe` consulta el repositorio público mediante la API de GitHub Releases.
- Prefiere un paquete `REEBOT-LAB-update-vX-to-vY.zip`; si no existe, puede usar el paquete completo.
- El digest SHA-256 publicado por GitHub es obligatorio antes de ejecutar el instalador.
- El parche se aplica en una nueva carpeta `app-Y`; `app-X` no se modifica y queda como respaldo.
- v0.4 necesita instalar una vez el puente con el actualizador. A partir de v0.5, el launcher comprueba el canal automáticamente.
