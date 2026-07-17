# IA local de REEBOT LAB

REEBOT LAB usa **Ollama** como motor local y `qwen3.5:9b` como modelo recomendado para una GPU de 8 GB. La IA y mascota se llama **REEBI**. No requiere suscripción y las conversaciones procesadas por el agente permanecen en la PC.

La interfaz local se muestra dentro de `REEBOT LAB Desktop.exe` mediante WebView2. El servicio de la UI sigue limitado a `http://localhost:3000`, pero ya no abre una pestaña del navegador.

## Activación en Windows

1. Instala Ollama desde <https://ollama.com/download/windows>.
2. Descarga el modelo:

   ```powershell
   ollama pull qwen3.5:9b
   ```

3. Comprueba que responde:

   ```powershell
   ollama run qwen3.5:9b
   ```

4. Abre `START_REEBOT_AGENT.cmd`.

## Acceso directo al modelo

Ejecuta `OPEN_REEBOT_AI.cmd` o selecciona **CONSOLA IA** desde `REEBOT LAB.exe`. Esto abre una terminal conectada directamente a `qwen3.5:9b`; escribe `/bye` para salir.

La API de Ollama permanece disponible en `http://127.0.0.1:11434`. No se publica en la red local ni en internet.

Si el servidor está apagado, `OPEN_REEBOT_AI.cmd` intenta iniciarlo automáticamente. Si Ollama no puede arrancar, REEBOT LAB conserva la telemetría y responde con su motor básico integrado; no bloquea la interfaz.

El agente detecta Ollama en `http://127.0.0.1:11434`, muestra un código temporal de seis dígitos y escucha únicamente en el loopback local `127.0.0.1:47831`.

## Vinculación con la página publicada

La página publicada no puede usar Ollama directamente. Debe vincularse con el agente local:

1. Mantén abierta la ventana de `START_REEBOT_AGENT.cmd`.
2. En REEBOT LAB abre **Ajustes**.
3. Ingresa el código mostrado por el agente.
4. El navegador recibe un token local persistente. El código cambia después de usarse.

Después de vincularse, la telemetría y las preguntas viajan directamente entre ese navegador y `127.0.0.1`. Si el agente no está disponible, la interfaz regresa al modo demostración y al análisis básico.

## Seguridad del puente local

- Sólo permite la interfaz local y el dominio publicado de REEBOT LAB.
- Requiere token para métricas e IA desde la versión publicada.
- Bloquea el código durante un minuto después de cinco intentos fallidos.
- Permite revocar el token desde Ajustes.
- No escucha en la red local ni abre puertos externos.
- Las métricas y el chat pueden usarse desde la versión vinculada, pero las acciones directas sólo aceptan solicitudes de la app local en el puerto 3000.
- La IA no ejecuta comandos ni recibe acceso a PowerShell. Sólo ordena candidatos que el agente ya marcó como modificables.
- Antes de cambiar un proceso, el agente vuelve a comprobar PID, nombre, hora de inicio, sesión y lista de protección.
- Cada cambio requiere confirmación en pantalla y genera un registro local en `.reebot-actions.jsonl`.
- La prioridad puede restaurarse y las pausas se reanudan automáticamente después de cinco minutos.

## Configuración opcional

Antes de iniciar el agente puedes cambiar el modelo:

```powershell
$env:REEBOT_AI_MODEL = "qwen3.5:9b"
```

## Límites actuales

- La IA recibe la pregunta, el perfil seleccionado y una instantánea de métricas.
- La CPU individual se estima entre dos muestras; la primera lectura aparece en cero.
- Las métricas globales y las gráficas CPU/GPU/VRAM se refrescan cada segundo.
- REEBI recibe reloj base, boost, zona XOC, offsets detectados y el proceso con mayor VRAM para explicar el estado con evidencia.
- Sólo se permiten dos acciones: prioridad baja reversible y pausa temporal de cinco minutos.
- REEBOT bloquea procesos de Windows, controladores, otras sesiones, Ollama y sus propios componentes.
- La primera vinculación requiere copiar manualmente el código del agente.
